'use strict';

let impressaoCompletaToken=0, impressaoCompletaEmAndamento=false;
function encerrarModoImpressao() {
  delete document.body.dataset.printMode;
  $('completePrint').replaceChildren(); $('completePrint').hidden=true;
}
function limparImpressaoCompleta() {
  impressaoCompletaToken++; impressaoCompletaEmAndamento=false;
  encerrarModoImpressao();
  $('reportCancelPrint').hidden=true; $('reportPrintStatus').textContent='';
}
function elementoImpressao(tag,texto) {
  const el=document.createElement(tag); el.textContent=String(texto??''); return el;
}
async function imprimirRelatorioCompleto() {
  if(!usuarioAtual||!dadosCarregados||relatorioCarregando||impressaoCompletaEmAndamento||!totalRelatorio||!validarPeriodoRelatorio())return;
  const filtros=filtrosRelatorioAtuais(), contexto=contextoConsulta(), token=++impressaoCompletaToken;
  const valida=()=>contexto()&&token===impressaoCompletaToken&&rotaAtual==='relatorios'&&filtrosRelatorioIguais(filtros,filtrosRelatorioAtuais());
  impressaoCompletaEmAndamento=true; encerrarModoImpressao();
  $('reportPrintFull').disabled=true; $('reportCancelPrint').hidden=false;
  $('reportPrintStatus').textContent='Preparando relatório completo...';
  const documento=document.createDocumentFragment();
  documento.appendChild(elementoImpressao('h1','14º BPM — Relatório de Afastamentos'));
  documento.appendChild(elementoImpressao('p',`${rotuloPeriodoRelatorio(filtros)} | De ${formatarData(filtros.ini)||'sem início definido'} até ${formatarData(filtros.fim)||'sem fim definido'} | Gerado em ${formatarData(hojeISO())}`));
  const policial=policiaisCatalogo.find(p=>String(p.id)===filtros.policial);
  const tipo=tiposCatalogo.find(t=>String(t.id)===filtros.tipo);
  documento.appendChild(elementoImpressao('p',`Policial: ${filtros.policial?(policial?.nome_completo||filtros.policial):'Todos'} | Tipo: ${filtros.tipo?(tipo?.sigla||filtros.tipo):'Todos'} | Cancelados excluídos.`));
  const resumo=elementoImpressao('p',''); resumo.className='complete-print-summary'; documento.appendChild(resumo);
  const tabela=document.createElement('table'),thead=document.createElement('thead'),cabecalho=document.createElement('tr'),tbody=document.createElement('tbody');
  for(const titulo of ['Matrícula','QRA','Nome','Tipo','Início','Término','Dias','Situação'])cabecalho.appendChild(elementoImpressao('th',titulo));
  thead.appendChild(cabecalho); tabela.append(thead,tbody); documento.appendChild(tabela);
  documento.appendChild(elementoImpressao('p','Dias correspondem à duração integral dos afastamentos encontrados, não apenas aos dias dentro do intervalo e nem a dias únicos de calendário. A base pode mudar durante a consulta.'));
  let total=0,dias=0; const pessoas=new Set();
  try {
    await percorrerAfastamentosOrdenados(()=>consultaRelatorioFiltrada(filtros),lote=>{
      const fragmento=document.createDocumentFragment();
      for(const r of lote) {
        const tr=document.createElement('tr');
        for(const valor of valoresRelatorio(r))tr.appendChild(elementoImpressao('td',valor));
        fragmento.appendChild(tr); total++; dias+=Number(r.dias||0); pessoas.add(String(r.policial_id));
      }
      tbody.appendChild(fragmento);
      $('reportPrintStatus').textContent=`Preparando relatório completo: ${total} registro(s)...`;
    },valida);
    conferirConsulta(valida);
    if(!total)throw new Error('Nenhum registro encontrado para imprimir.');
    resumo.textContent=`Relatório completo: ${total} afastamento(s) | ${pessoas.size} policial(is) distinto(s) | ${dias} dia(s) somados.`;
    $('completePrint').replaceChildren(documento); $('completePrint').hidden=false;
    $('reportPrintStatus').textContent=`Relatório completo preparado: ${total} registro(s). Na janela de impressão, escolha Salvar como PDF.`;
    document.body.dataset.printMode='completo';
    try { window.print(); } finally { delete document.body.dataset.printMode; }
  } catch(error) {
    if(contexto()&&token===impressaoCompletaToken){
      encerrarModoImpressao();
      $('reportPrintStatus').textContent='Impressão não iniciada. '+(error.name==='AbortError'?'Preparação cancelada.':erroAmigavel(error));
    }
  } finally {
    if(token===impressaoCompletaToken) {
      impressaoCompletaEmAndamento=false; $('reportCancelPrint').hidden=true;
      $('reportPrintFull').disabled=relatorioCarregando||!totalRelatorio;
    }
  }
}
$('reportPrintFull').addEventListener('click',()=>{void imprimirRelatorioCompleto();});
$('reportCancelPrint').addEventListener('click',()=>{
  limparImpressaoCompleta();
  $('reportPrintFull').disabled=relatorioCarregando||!totalRelatorio;
  $('reportPrintStatus').textContent='Preparação cancelada. Nenhuma impressão parcial foi iniciada.';
});
window.addEventListener('afterprint',encerrarModoImpressao);
