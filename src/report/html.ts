import { writeFileSync } from "node:fs";
import type { Workspace } from "../core/workspace.js";
import { computeStages, STATE_LABEL, type StageState } from "../core/stages.js";
import { LEVELS } from "../company/levels.js";
import { answerMap, levelStatus, visibleQuestions } from "../company/progress.js";
import { categoryLabel, confidenceLabel, topicLabel } from "../core/labels.js";

/**
 * Relatório de acompanhamento em HTML: um único arquivo que abre em qualquer navegador,
 * sem internet e sem instalar nada. Pensado para quem não é técnico acompanhar o processo
 * e entender POR QUE cada coisa foi feita ou perguntada.
 */

const esc = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const STATE_CLASS: Record<StageState, string> = {
  concluida: "ok",
  "em-andamento": "doing",
  pendente: "todo",
  bloqueada: "blocked",
  "em-breve": "soon",
};

export function renderReport(ws: Workspace): string {
  const company = ws.loadCompany();
  const inv = ws.loadInventory();
  const qs = ws.loadQuestions();
  const stages = computeStages(ws);
  const answers = answerMap(company);
  const status = levelStatus(company);
  const open = qs.filter((q) => q.status === "aberta");

  // ── Etapas ──
  const stagesHtml = stages
    .map(
      (s) => `
      <li class="stage ${STATE_CLASS[s.state]}">
        <div class="num">${s.number}</div>
        <div>
          <div class="stage-head"><strong>${esc(s.title)}</strong><span class="pill">${STATE_LABEL[s.state]}</span></div>
          <p>${esc(s.what)}</p>
          <p class="muted"><b>Por que nesta ordem:</b> ${esc(s.why)}</p>
          <p class="muted"><b>Situação:</b> ${esc(s.progress)}</p>
        </div>
      </li>`,
    )
    .join("");

  // ── Negócio ──
  const levelsHtml = LEVELS.map((level) => {
    const st = status.find((x) => x.level === level.level)!;
    const qsv = visibleQuestions(level, answers);
    const rows = qsv
      .map((q) => {
        const v = answers[q.id];
        const deferred = company.deferred.includes(q.id) && !(q.id in company.answers);
        const empty = v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
        if (empty && !deferred) return "";
        const val = deferred
          ? `<span class="tag warn">pendente${q.askWho ? `: perguntar a ${esc(q.askWho)}` : ""}</span>`
          : Array.isArray(v)
            ? `<ul>${v.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`
            : esc(v);
        return `<tr><th>${esc(q.prompt)}</th><td>${val}</td></tr>`;
      })
      .join("");
    return `
      <details ${st.answered > 0 && !st.complete ? "open" : ""}>
        <summary><span>Nível ${level.level}: ${esc(level.title)}</span>
          <span class="pill ${st.complete ? "ok" : st.answered ? "doing" : "todo"}">${st.complete ? "Concluído" : `${st.answered} de ${st.total}`}</span></summary>
        <p class="muted">${esc(level.why)}</p>
        <p class="muted"><b>Estas respostas embasam:</b> ${level.informs.map(esc).join(" · ")}</p>
        ${rows ? `<table>${rows}</table>` : `<p class="muted"><i>Ainda não respondido.</i></p>`}
      </details>`;
  }).join("");

  // ── Tecnologia ──
  const hostsHtml = inv.hosts.length
    ? inv.hosts
        .map(
          (h) => `
      <div class="card">
        <h3>${esc(h.hostname)} <span class="muted small">${esc(h.role ?? "")} · ${esc(h.os.name)}</span></h3>
        <p class="muted small">Analisado em ${esc(new Date(h.collectedAt).toLocaleString("pt-BR"))} ·
          ${h.software.length} programas · ${h.services.length} serviços · ${h.scheduledTasks.length} tarefas agendadas</p>
        ${
          h.systems.length
            ? `<table><tr><th>Sistema</th><th>Tipo</th><th>Certeza</th><th>Como reconhecemos</th></tr>
            ${h.systems
              .map(
                (s) =>
                  `<tr><td><b>${esc(s.systemName)}</b></td><td>${esc(categoryLabel(s.category))}</td><td><span class="tag ${s.confidence}">${esc(confidenceLabel(s.confidence))}</span></td><td class="small">${s.evidence.map(esc).join("<br>")}</td></tr>`,
              )
              .join("")}</table>`
            : `<p class="muted">Nenhum sistema conhecido reconhecido nesta máquina.</p>`
        }
      </div>`,
        )
        .join("")
    : `<p class="muted">Nenhuma máquina analisada ainda.</p>`;

  // ── Pendências ──
  const groups = new Map<string, typeof open>();
  for (const q of open) groups.set(q.topic, [...(groups.get(q.topic) ?? []), q]);
  const pendHtml = open.length
    ? [...groups]
        .map(
          ([topic, items]) => `
      <h3>${esc(topicLabel(topic))}</h3>
      <ul class="pend">${items
        .map(
          (q) =>
            `<li><div>${esc(q.text)}</div>${q.askWho ? `<span class="tag">quem sabe: ${esc(q.askWho)}</span>` : ""}${q.context ? `<div class="muted small">Por que perguntamos: ${esc(q.context)}</div>` : ""}</li>`,
        )
        .join("")}</ul>`,
        )
        .join("")
    : `<p class="muted">Nenhuma pendência aberta.</p>`;

  const resolved = qs.filter((q) => q.status !== "aberta");
  const resolvedHtml = resolved.length
    ? `<details><summary><span>Pendências já resolvidas (${resolved.length})</span></summary><table>${resolved
        .map((q) => `<tr><th>${esc(q.text)}</th><td>${q.status === "descartada" ? "<i>não se aplica</i>" : esc(q.answer)}</td></tr>`)
        .join("")}</table></details>`
    : "";

  // ── Mudanças: agrupadas por rodada (mesmo horário de registro), mais recentes primeiro ──
  const changes = ws.loadChanges();
  const rounds = new Map<string, typeof changes>();
  for (const ch of changes) rounds.set(`${ch.at}|${ch.subject}`, [...(rounds.get(`${ch.at}|${ch.subject}`) ?? []), ch]);
  const IMP = { alta: "importante", media: "moderada", baixa: "rotina" } as const;
  const changesHtml = rounds.size
    ? [...rounds]
        .reverse()
        .slice(0, 8)
        .map(([key, items], i) => {
          const [at, subject] = key.split("|");
          const relevant = items.filter((c) => c.importance !== "baixa");
          const routine = items.length - relevant.length;
          return `<details ${i === 0 ? "open" : ""}><summary><span>${esc(new Date(at).toLocaleString("pt-BR"))} · ${esc(topicLabel(subject.startsWith("host:") ? subject : "entrevista:"))}</span>
            <span class="pill">${items.length} mudança(s)</span></summary>
            ${relevant.length ? `<ul class="changes">${relevant.map((c) => `<li><span class="tag imp-${c.importance}">${IMP[c.importance]}</span> ${esc(c.summary)}${c.kind === "alterado" && c.area === "resposta" ? `<div class="muted small">antes: ${esc(c.before)}<br>agora: ${esc(c.after)}</div>` : ""}</li>`).join("")}</ul>` : ""}
            ${routine ? `<p class="muted small">+ ${routine} mudança(s) de rotina (atualizações de versão, serviços do sistema).</p>` : ""}
          </details>`;
        })
        .join("")
    : `<p class="muted">Nenhuma mudança registrada ainda. Quando você analisar um computador de novo ou corrigir uma resposta, as diferenças aparecem aqui.</p>`;

  // ── Arquivos gerados ──
  const manifest = ws.loadManifest();
  const generatedHtml = Object.values(manifest.artifacts).length
    ? `<table><tr><th>Arquivo</th><th>Versão</th><th>Última geração</th></tr>${Object.values(manifest.artifacts)
        .map((a) => `<tr><td><code>${esc(a.path)}</code></td><td>${a.version}</td><td>${esc(new Date(a.generatedAt).toLocaleString("pt-BR"))}</td></tr>`)
        .join("")}</table>`
    : `<p class="muted">Nada gerado ainda.</p>`;

  const updated = new Date().toLocaleString("pt-BR");

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Relatório: ${esc(company.name)}</title>
<style>
:root{--bg:#f7f7f5;--card:#fff;--fg:#1d1d1b;--muted:#6b6b66;--line:#e4e4df;--accent:#2f6fde;
--ok:#1e8a4c;--okbg:#e5f4ec;--doing:#a86300;--doingbg:#fdf1de;--todo:#555;--todobg:#eee;--soonbg:#eef0f7;--soon:#5560a0;--warnbg:#fde8e6;--warn:#b3261e}
@media (prefers-color-scheme:dark){:root{--bg:#161615;--card:#1f1f1e;--fg:#ececea;--muted:#a3a39d;--line:#33332f;--accent:#7aa7ff;
--ok:#6fd39a;--okbg:#17321f;--doing:#f0b35b;--doingbg:#352813;--todo:#bbb;--todobg:#2a2a2a;--soonbg:#23253a;--soon:#a8b0ee;--warnbg:#3a1d1b;--warn:#f2a29b}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:960px;margin:0 auto;padding:32px 16px 64px}h1{font-size:1.8rem;margin:0 0 4px}h2{margin:40px 0 12px;font-size:1.3rem}h3{margin:20px 0 8px;font-size:1.05rem}
.muted{color:var(--muted)}.small{font-size:.875rem}p{margin:6px 0}
.intro{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px 20px;margin-top:16px}
ol.stages{list-style:none;padding:0;margin:0;display:grid;gap:10px}
.stage{display:flex;gap:14px;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px}
.stage .num{flex:0 0 32px;height:32px;border-radius:50%;display:grid;place-items:center;font-weight:700;background:var(--todobg);color:var(--todo)}
.stage.ok .num{background:var(--okbg);color:var(--ok)}.stage.doing .num{background:var(--doingbg);color:var(--doing)}.stage.soon{opacity:.75}
.stage-head{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.pill,.tag{display:inline-block;font-size:.75rem;padding:2px 9px;border-radius:999px;background:var(--todobg);color:var(--todo);white-space:nowrap}
.pill.ok,.ok>div>.stage-head .pill{background:var(--okbg);color:var(--ok)}.pill.doing,.doing>div>.stage-head .pill{background:var(--doingbg);color:var(--doing)}
.soon>div>.stage-head .pill{background:var(--soonbg);color:var(--soon)}.blocked>div>.stage-head .pill{background:var(--warnbg);color:var(--warn)}
.tag.warn,.tag.baixa{background:var(--warnbg);color:var(--warn)}.tag.media{background:var(--doingbg);color:var(--doing)}.tag.alta{background:var(--okbg);color:var(--ok)}
details{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 16px;margin:10px 0}
summary{cursor:pointer;display:flex;justify-content:space-between;gap:10px;font-weight:600;list-style:none}summary::-webkit-details-marker{display:none}
summary::before{content:"▸";margin-right:6px;color:var(--muted)}details[open]>summary::before{content:"▾"}summary>span:first-child{flex:1}
table{width:100%;border-collapse:collapse;margin-top:10px;font-size:.92rem;display:block;overflow-x:auto}
th,td{text-align:left;vertical-align:top;padding:8px 10px;border-top:1px solid var(--line)}th{font-weight:600;width:42%}
td ul{margin:0;padding-left:18px}.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 18px;margin:10px 0}
.card h3{margin-top:0}ul.pend{padding-left:0;list-style:none}ul.pend li{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:10px 14px;margin:8px 0}
ul.pend .tag{margin-top:6px}ul.changes{padding-left:0;list-style:none}ul.changes li{padding:6px 0;border-top:1px solid var(--line)}
.tag.imp-alta{background:var(--warnbg);color:var(--warn)}.tag.imp-media{background:var(--doingbg);color:var(--doing)}code{font-size:.85em}footer{margin-top:48px;font-size:.85rem;color:var(--muted)}
</style></head>
<body><main>
<h1>${esc(company.name)}</h1>
<p class="muted">Relatório de acompanhamento do MCP-Builder · atualizado em ${esc(updated)}</p>

<div class="intro">
<p><b>Como ler este relatório.</b> O MCP-Builder prepara a sua empresa para ter um assistente de IA (agente) que ajude os colaboradores no dia a dia.
Ele funciona em etapas, <b>do básico ao complexo</b>: primeiro entende o negócio, depois a tecnologia, tira as dúvidas com as pessoas e só então monta o agente.</p>
<p>Este arquivo é atualizado automaticamente a cada passo. ${open.length ? `Hoje há <b>${open.length} pendência(s)</b> esperando resposta de alguém.` : ""}</p>
</div>

<h2>Onde estamos</h2>
<ol class="stages">${stagesHtml}</ol>

<h2>O que já sabemos sobre a empresa</h2>
<p class="muted">Respostas da entrevista, organizadas do mais básico (identidade) ao mais específico (o agente).</p>
${levelsHtml}

<h2>Tecnologia encontrada</h2>
<p class="muted">O que a análise dos computadores encontrou. A análise é somente leitura e senhas são ocultadas automaticamente.</p>
${hostsHtml}

<h2>Pendências</h2>
<p class="muted">Coisas que a ferramenta não conseguiu entender sozinha. Ela pergunta em vez de supor.</p>
${pendHtml}
${resolvedHtml}

<h2>O que mudou</h2>
<p class="muted">Cada nova análise é comparada com a anterior, e só as diferenças são registradas. Assim, se a empresa trocar o servidor de e-mail, por exemplo, só o que depende do e-mail precisa ser refeito.</p>
${changesHtml}

<h2>Arquivos gerados para o agente</h2>
<p class="muted">Cada arquivo só é refeito quando as informações das quais ele depende mudam. A versão aumenta a cada vez que ele é refeito.</p>
${generatedHtml}

<footer>Gerado pelo MCP-Builder. Os dados deste relatório ficam somente neste computador, na pasta da empresa.</footer>
</main></body></html>`;
}

export function writeReport(ws: Workspace): string {
  const path = ws.path("relatorio.html");
  writeFileSync(path, renderReport(ws), "utf8");
  return path;
}
