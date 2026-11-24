'use strict';

// Fragmentos funcionam no subdiretório de um GitHub Pages e preservam links antigos.
const TELAS = {
  painel: { titulo: 'Painel de Afastamentos', paineis: ['v11Dashboard', 'alertsPanel'], carregar: () => carregarPainel() },
  alertas: { titulo: 'Alertas de retorno', paineis: ['alertsPanel'], carregar: () => carregarAlertas() },
  agenda: { titulo: 'Agenda', paineis: ['agendaPanel'], carregar: () => carregarAgenda() },
  'novo-afastamento': { titulo: 'Novo afastamento', paineis: ['v11Cadastro'] },
  afastamentos: { titulo: 'Registros de afastamentos', paineis: ['v11Registros'], carregar: () => consultarRegistros() },
  historico: { titulo: 'Histórico individual', paineis: ['historyPanel'], carregar: () => consultarHistorico() },
  relatorios: { titulo: 'Relatórios', paineis: ['reportPanel'], carregar: () => consultarRelatorio() },
  cadastros: { titulo: 'Administração de cadastros', paineis: ['cadastrosPanel'], admin: true, carregar: () => carregarCadastros() },
  usuarios: { titulo: 'Usuários', paineis: ['usuariosPanel'], admin: true, carregar: () => carregarUsuarios() },
  seguranca: { titulo: 'Segurança', paineis: ['securityPanel'], admin: true },
  auditoria: { titulo: 'Auditoria', paineis: ['auditPanel'], admin: true,
    carregar: () => Promise.all([carregarAuditoria(), v20CarregarEmailsAuditoria()]) }
};
const ROTAS_ANTIGAS = Object.fromEntries(
  Object.entries(TELAS).map(([rota, tela]) => [tela.paineis[0], rota])
);
let rotaAtual = 'painel';
let dadosCarregados = false;
let geracaoTelas = 0;
const consultasTela = new Map();

function invalidarTelas() {
  dadosCarregados = false;
  cancelarConsultasAtuais();
  geracaoTelas++;
  consultasTela.clear();
  $('moduleMessage').hidden = true;
  $('moduleMessage').textContent = '';
}

async function carregarTelaAtual() {
  const rota = rotaAtual, tela = TELAS[rota];
  if (!usuarioAtual || !dadosCarregados || !tela.carregar || (tela.admin && !ehAdmin())) return;
  if (consultasTela.has(rota)) return consultasTela.get(rota);
  const geracao = geracaoTelas;
  const consulta = Promise.resolve().then(() => {
    if (geracao === geracaoTelas && usuarioAtual && (!tela.admin || ehAdmin())) return tela.carregar();
  }).catch(error => {
    if(error.name==='AbortError')return;
    console.error('Erro ao carregar a tela:', error);
    if (geracao === geracaoTelas && rota === rotaAtual && usuarioAtual) {
      setMsg('moduleMessage', 'Não foi possível carregar esta tela. Use Atualizar para tentar novamente. ' + erroAmigavel(error), true);
      $('moduleMessage').hidden = false;
    }
  }).finally(() => {
    if (geracao === geracaoTelas) consultasTela.delete(rota);
  });
  consultasTela.set(rota, consulta);
  return consulta;
}

function renderizarRota({ carregar = true, foco = false } = {}) {
  if (!usuarioAtual) return;
  const fragmento = window.location.hash.slice(1);
  const solicitada = fragmento.startsWith('/') ? fragmento.slice(1) : ROTAS_ANTIGAS[fragmento];
  const permitida = Object.hasOwn(TELAS, solicitada) && (!TELAS[solicitada].admin || ehAdmin());
  const destino = permitida ? solicitada : 'painel';
  if(rotaAtual==='afastamentos' && destino!==rotaAtual){
    consultaRegistrosToken++; clearTimeout(timerBuscaRegistros); consultasTela.delete(rotaAtual);
  }
  if(rotaAtual==='relatorios'&&destino!==rotaAtual)limparImpressaoCompleta();
  rotaAtual = destino;
  const tela = TELAS[rotaAtual], hash = '#/' + rotaAtual;
  if (window.location.hash !== hash) history.replaceState(null, '', hash);
  document.querySelectorAll('[data-screen]').forEach(painel => {
    painel.hidden = !tela.paineis.includes(painel.id);
  });
  $('v11Nav').querySelectorAll('a').forEach(link => {
    if (link.getAttribute('href') === hash) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  $('pageTitle').textContent = tela.titulo;
  mostrarUltimaConsulta();
  document.title = tela.titulo + ' | Controle de Afastamentos — 14º BPM';
  $('moduleMessage').hidden = true;
  $('v11Top').hidden = true;
  if (foco) {
    if (window.innerWidth <= 900 && !$('systemPage').classList.contains('menu-fechado')) {
      $('v20ToggleMenu').click();
    }
    $('pageTitle').focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  if (carregar) void carregarTelaAtual();
}

function navegarPara(rota) {
  if (window.location.hash === '#/' + rota) renderizarRota({ foco: true });
  else window.location.hash = '/' + rota;
}

function configurarNavegacao() {
  window.addEventListener('hashchange', () => renderizarRota({ foco: true }));
  $('v11Nav').querySelectorAll('a').forEach(link => {
    link.addEventListener('click', event => {
      // Preserva abrir em nova aba, copiar link e histórico nativo.
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button > 0) return;
      if (link.getAttribute('href') === window.location.hash) {
        event.preventDefault();
        renderizarRota({ foco: true });
      }
    });
  });
  $('v11Top').addEventListener('click', () => {
    $('pageTitle').focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  window.addEventListener('scroll', () => {
    $('v11Top').hidden = $('systemPage').hidden || window.scrollY < 550;
  }, { passive: true });

  const sistema = $('systemPage'), botao = $('v20ToggleMenu');
  function definirMenu(fechado) {
    sistema.classList.toggle('menu-fechado', fechado);
    botao.setAttribute('aria-expanded', String(!fechado));
    botao.setAttribute('aria-label', fechado ? 'Expandir menu lateral' : 'Recolher menu lateral');
    botao.title = fechado ? 'Expandir menu lateral' : 'Recolher menu lateral';
  }
  definirMenu(window.innerWidth <= 900);
  botao.addEventListener('click', () => definirMenu(!sistema.classList.contains('menu-fechado')));
}

configurarNavegacao();
