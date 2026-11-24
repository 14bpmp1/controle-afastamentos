'use strict';

// V19: temporizador de inatividade da interface (não substitui RLS nem expiração de JWT).
const V19_IDLE_MS=15*60*1000;
const V19_WARNING_MS=2*60*1000;
let v19LastActivity=Date.now(),v19Timer=null,v19LoggingOut=false,v19LastFocus=null;
function v19HideWarning(){
  const overlay=$('v19TimeoutOverlay');
  if(!overlay.hidden){overlay.hidden=true;v19LastFocus?.focus?.();}
  v19LastFocus=null;
}
function v19StopIdle(){
  if(v19Timer!==null){clearInterval(v19Timer);v19Timer=null;}
  $('v19TimeoutOverlay').hidden=true;v19LastFocus=null;
}
function v19StartIdle(){
  v19StopIdle();v19LastActivity=Date.now();
  v19Timer=setInterval(v19CheckIdle,1000);
}
function v19Activity(){
  if(!usuarioAtual||v19LoggingOut||$('systemPage').hidden)return;
  // Durante o aviso, somente o botão Continuar conectado reinicia o prazo.
  if(!$('v19TimeoutOverlay').hidden)return;
  v19LastActivity=Date.now();
}
function v19CheckIdle(){
  if(!usuarioAtual||$('systemPage').hidden||v19LoggingOut){v19StopIdle();return;}
  const restante=V19_IDLE_MS-(Date.now()-v19LastActivity);
  if(restante<=0){v19StopIdle();void v19Expire();return;}
  if(restante<=V19_WARNING_MS){
    if($('v19TimeoutOverlay').hidden){
      v19LastFocus=document.activeElement;
      $('v19TimeoutOverlay').hidden=false;
      $('v19StayConnected').focus();
    }
    const segundos=Math.ceil(restante/1000);
    $('v19Countdown').textContent=`${Math.floor(segundos/60)}:${String(segundos%60).padStart(2,'0')}`;
  }
}
async function v19Expire(){
  if(v19LoggingOut)return;
  v19LoggingOut=true;
  // Oculta dados imediatamente, mesmo que a rede esteja indisponível.
  exibirLogin();
  setMsg('loginMessage','Sessão encerrada após 15 minutos de inatividade. Faça login novamente.');
  try{if(db)await db.auth.signOut();}
  catch(error){console.error('Não foi possível revogar a sessão no servidor:',error);
    setMsg('loginMessage','Sessão encerrada nesta tela. Não foi possível confirmar o logout no servidor; feche a aba e verifique a conexão antes de usar novamente.',true);
  }finally{v19LoggingOut=false;}
}
['pointerdown','keydown','input','scroll'].forEach(evento=>
  document.addEventListener(evento,v19Activity,{passive:true,capture:true}));
document.addEventListener('visibilitychange',()=>{if(!document.hidden)v19CheckIdle();});
$('v19StayConnected').addEventListener('click',()=>{
  if(!usuarioAtual)return;
  v19LastActivity=Date.now();v19HideWarning();
});
$('v19LogoutNow').addEventListener('click',()=>{void sair();});
// Impede interação com o conteúdo de fundo enquanto o aviso está aberto.
$('v19TimeoutOverlay').addEventListener('keydown',e=>{
  if(e.key!=='Tab')return;
  const a=$('v19LogoutNow'),b=$('v19StayConnected');
  if(e.shiftKey&&document.activeElement===a){e.preventDefault();b.focus();}
  else if(!e.shiftKey&&document.activeElement===b){e.preventDefault();a.focus();}
});
function exibirLogin(){v19StopIdle();usuarioAtual=null;perfilAtual=null;policiais=[];tipos=[];registros=[];averbacoes=[];erroView=null;editandoId=null;auditoria=[];v20EmailsUsuarios=new Map();relatorioToken++;registrosRelatorio=[];totalRelatorio=0;paginaRelatorio=1;historicoToken++;registrosHistorico=[];totalHistorico=0;paginaHistorico=1;paginaAuditoria=1;totalAuditoria=0;consultaAuditoriaToken++;$('loginPage').hidden=false;$('systemPage').hidden=true;$('logout').hidden=true;
  invalidarTelas();
  todosPoliciais=[];todosTipos=[];policiaisCatalogo=[];tiposCatalogo=[];editPolicialId=null;editTipoId=null;
  dadosAlertas=[];dadosAgenda=[];totalRegistros=0;averbacoesHistorico=[];erroViewHistorico=null;
  importLimpar();
  ['recordsExportStatus','reportExportStatus','panelInfo'].forEach(id=>$(id).textContent='');
  document.querySelectorAll('[data-screen]').forEach(painel=>painel.hidden=true);
  document.querySelectorAll('.v11-admin-link').forEach(link=>link.hidden=true);
  $('v11Top').hidden=true;
  document.title='Controle de Afastamentos | 14º BPM';
  $('password').value='';
  document.querySelectorAll('#systemPage tbody').forEach(t=>t.replaceChildren());
  document.querySelectorAll('.securityItem').forEach(x=>x.checked=false);
  $('securityResult').textContent='';$('securityChecklistStatus').textContent='0 de 6 itens conferidos nesta sessão.';
  ['userInfo','recordsInfo','reportInfo','historyInfo','auditInfo','alertsSummary'].forEach(id=>{const el=$(id);if(el)el.textContent='';});
  $('afastamentoForm').reset();
}
function erroAmigavel(error){const codigo=error?.code||'';const msg=error?.message||String(error);if(codigo==='invalid_credentials'||/Invalid login credentials/i.test(msg))return 'E-mail ou senha incorretos. Confira a conta criada em Authentication → Users.';if(codigo==='email_not_confirmed'||/Email not confirmed/i.test(msg))return 'E-mail ainda não confirmado no Supabase.';if(/Invalid API key/i.test(msg))return 'Chave pública inválida. Confira a Publishable key do mesmo projeto.';return msg;}
async function verificarSessao(){
  if(!db)throw new Error('Conexão com o Supabase não inicializada.');
  const {data,error}=await db.auth.getUser();
  if(error||!data?.user){exibirLogin();return;}
  const {data:perfil,error:erroPerfil}=await db.from('perfis').select('nome,perfil,ativo').eq('id',data.user.id).maybeSingle();
  if(erroPerfil)throw new Error('Não foi possível consultar o perfil: '+erroPerfil.message);
  if(!perfil||!perfil.ativo){await db.auth.signOut();exibirLogin();setMsg('loginMessage','Conta autenticada, mas ainda não autorizada. Ative o perfil no SQL Editor.',true);return;}
  usuarioAtual=data.user;perfilAtual=perfil;
  $('loginPage').hidden=true;$('systemPage').hidden=false;$('logout').hidden=false;
  v19StartIdle();
  $('userInfo').textContent=perfil.nome+' · '+perfil.perfil;
  document.querySelectorAll('.v11-admin-link').forEach(link=>{link.hidden=!ehAdmin();});
  $('actionsHeader').hidden=!ehAdmin();
  renderizarRota({carregar:false});
  await carregarDados();
}
async function entrar(){
  const botao=$('loginButton');botao.disabled=true;setMsg('loginMessage','Verificando acesso...');
  try{
    if(!db?.auth)throw new Error('A conexão não foi inicializada. Recarregue a página e verifique a configuração.');
    const {error}=await db.auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value});
    if(error)throw error;
    $('password').value='';
    await verificarSessao();
  }catch(error){console.error('Falha no login:',error);setMsg('loginMessage','Não foi possível entrar: '+erroAmigavel(error),true);}
  finally{botao.disabled=!db?.auth;botao.textContent='Entrar';}
}
async function sair(){
  v19StopIdle();exibirLogin();
  try{if(db)await db.auth.signOut();setMsg('loginMessage','Sessão encerrada.');}
  catch(e){console.error(e);setMsg('loginMessage','A tela foi encerrada, mas o logout no servidor não foi confirmado. Verifique sua conexão.',true);}
}
