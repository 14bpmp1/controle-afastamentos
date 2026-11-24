'use strict';

let totalRegistros = 0, consultaRegistrosToken = 0, timerBuscaRegistros = null;
let indiceRegistros = null, exportandoRegistros = false, cancelarCsvRegistros = false;
function filtrosRegistrosAtuais() {
  return Object.fromEntries(['filterText','filterPolicial','filterMes','filterAverbacao','filterTipo','filterInicio','filterFim','filterSituacao'].map(id => [id, $(id).value]));
}
function consultaRegistrosFiltrada(f, colunas = COLUNAS_AFASTAMENTO, opcoes = {}) {
  let q = db.from('afastamentos').select(colunas, opcoes);
  if (f.filterPolicial) q = q.eq('policial_id', f.filterPolicial);
  if (f.filterTipo) q = q.eq('tipo_id', f.filterTipo);
  if (f.filterInicio) q = q.gte('data_inicio', f.filterInicio);
  if (f.filterFim) q = q.lte('data_inicio', f.filterFim);
  if (f.filterMes) {
    const [ano, mes] = f.filterMes.split('-').map(Number);
    const seguinte = mes === 12 ? `${ano+1}-01-01` : `${ano}-${String(mes+1).padStart(2,'0')}-01`;
    q = q.gte('data_inicio', f.filterMes + '-01').lt('data_inicio', seguinte);
  }
  const hoje = hojeISO(), estado = f.filterSituacao;
  if (estado === 'Cancelado') q = q.not('cancelado_em', 'is', null);
  if (estado === 'Ativo') q = q.is('cancelado_em', null).lte('data_inicio', hoje).gte('data_fim', hoje);
  if (estado === 'Programado' || estado === 'Futuro') q = q.is('cancelado_em', null).gt('data_inicio', hoje);
  if (estado === 'Encerrado') q = q.is('cancelado_em', null).lt('data_fim', hoje);
  return q;
}
function registrosDoLote(lote, f, av) {
  const mapa = new Map(av.map(a => [String(a.afastamento_id), a]));
  const texto = normalizarBuscaPolicial(f.filterText);
  const pessoas = new Map(policiaisCatalogo.map(p=>[String(p.id),p]));
  const categorias = new Map(tiposCatalogo.map(t=>[String(t.id),t]));
  return lote.filter(r => {
    const p = r.policiais || pessoas.get(String(r.policial_id));
    const t = r.tipos_afastamento || categorias.get(String(r.tipo_id));
    const descricao = normalizarBuscaPolicial([p?.matricula,p?.qra,p?.nome_completo,t?.sigla].join(' '));
    const situacaoAv = r.cancelado_em ? 'NAO APLICAVEL' : mapa.get(String(r.id))?.situacao_averbacao || 'NAO APLICAVEL';
    return (!texto || descricao.includes(texto)) && (!f.filterAverbacao || situacaoAv === f.filterAverbacao);
  });
}
function periodoRegistrosValido(f) {
  return !f.filterInicio || !f.filterFim || f.filterInicio <= f.filterFim;
}
async function consultarRegistros() {
  if (!usuarioAtual || !dadosCarregados || rotaAtual !== 'afastamentos') return;
  clearTimeout(timerBuscaRegistros);
  const token = ++consultaRegistrosToken, contexto = contextoConsulta();
  const f = filtrosRegistrosAtuais(), valida = () => contexto() && token === consultaRegistrosToken;
  iniciarConsultaTela('afastamentos');
  registros = []; averbacoes = []; erroView = null;
  $('recordsBody').replaceChildren();
  $('recordsPrev').disabled = true; $('recordsNext').disabled = true; $('exportCsv').disabled = true;
  $('recordsInfo').textContent = 'Consultando registros...';
  try {
    if (!periodoRegistrosValido(f)) throw new Error('A data inicial não pode ser posterior à final.');
    let dados;
    if (f.filterText.trim() || f.filterAverbacao) {
      // Texto e averbação cruzam tabelas sem relação SQL exposta. Percorre só os
      // candidatos dos filtros de banco e conserva apenas IDs para paginar.
      const chave = JSON.stringify([f, geracaoTelas, hojeISO()]);
      if (indiceRegistros?.chave !== chave) {
        const ids = [];
        let lidos = 0;
        await percorrerPorId(() => consultaRegistrosFiltrada(f,'id,policial_id,tipo_id,data_inicio,cancelado_em'), async lote => {
          const av = f.filterAverbacao ? await buscarAverbacoes(lote.filter(r=>!r.cancelado_em).map(r=>r.id), valida) : [];
          conferirConsulta(valida);
          ids.push(...registrosDoLote(lote, f, av).map(r => ({id:r.id, data:r.data_inicio})));
          lidos += lote.length;
          $('recordsInfo').textContent = `Aplicando filtros: ${lidos} candidato(s) conferidos...`;
        }, valida);
        ids.sort((a,b)=>b.data.localeCompare(a.data)||Number(b.id)-Number(a.id));
        indiceRegistros = { chave, ids: ids.map(r=>r.id) };
      }
      totalRegistros = indiceRegistros.ids.length;
      paginaRegistros = Math.min(paginaRegistros, Math.max(1,Math.ceil(totalRegistros/TAMANHO_PAGINA)));
      const ids = indiceRegistros.ids.slice((paginaRegistros-1)*TAMANHO_PAGINA,paginaRegistros*TAMANHO_PAGINA);
      dados = ids.length ? (await resultadoConsulta(db.from('afastamentos').select(COLUNAS_AFASTAMENTO).in('id',ids).order('data_inicio',{ascending:false}).order('id',{ascending:false}))).data : [];
    } else {
      const resposta = await resultadoConsulta(consultaRegistrosFiltrada(f,COLUNAS_AFASTAMENTO,{count:'exact'})
        .order('data_inicio',{ascending:false}).order('id',{ascending:false})
        .range((paginaRegistros-1)*TAMANHO_PAGINA,paginaRegistros*TAMANHO_PAGINA-1));
      conferirConsulta(valida);
      totalRegistros = resposta.count ?? 0;
      const ultima = Math.max(1,Math.ceil(totalRegistros/TAMANHO_PAGINA));
      if (paginaRegistros > ultima) { paginaRegistros = ultima; return consultarRegistros(); }
      dados = resposta.data || [];
    }
    conferirConsulta(valida);
    let av = [], erroAv = null;
    try { av = await buscarAverbacoes(dados.filter(r=>!r.cancelado_em).map(r=>r.id),valida); }
    catch (error) { conferirConsulta(valida); erroAv = error; }
    conferirConsulta(valida);
    registros = dados; averbacoes = av; erroView = erroAv;
    mostrarRegistros();concluirConsultaTela('afastamentos',!erroAv);
    $('avisoAverbacao').textContent = erroAv
      ? 'Averbação indisponível: ' + erroAmigavel(erroAv)
      : 'Averbação indicativa consultada para os registros desta página. A situação é do ciclo completo, não do evento individual.';
  } catch (error) {
    if (!valida() || error.name === 'AbortError') return;
    concluirConsultaTela('afastamentos',false);
    totalRegistros = 0; registros = []; averbacoes = []; mostrarRegistros();
    $('recordsInfo').textContent = 'Não foi possível consultar: ' + erroAmigavel(error);
  }
}
function agendarConsultaRegistros(espera = 0) {
  clearTimeout(timerBuscaRegistros); consultaRegistrosToken++; cancelarCsvRegistros = true;
  paginaRegistros = 1;
  $('recordsBody').replaceChildren(); $('recordsInfo').textContent = 'Atualizando filtros...';
  $('exportCsv').disabled = true; $('recordsPrev').disabled = true; $('recordsNext').disabled = true;
  timerBuscaRegistros = setTimeout(() => { void consultarRegistros(); }, espera);
}

function mostrarRegistros(){
  const tbody=$('recordsBody');tbody.replaceChildren();
  const mapa=new Map(averbacoes.map(a=>[String(a.afastamento_id),a]));
  const totalPaginas=Math.max(1,Math.ceil(totalRegistros/TAMANHO_PAGINA));
  const pagina=registros;
  pagina.forEach(r=>{
    const a=mapa.get(String(r.id)),tr=document.createElement('tr'),s=situacao(r);
    const valores=[r.policiais?.matricula||'',r.policiais?.qra||'',r.policiais?.nome_completo||'',r.tipos_afastamento?.sigla||'',formatarData(r.data_inicio),formatarData(r.data_fim),String(r.dias),s];
    valores.forEach((v,i)=>{
      const td=document.createElement('td');
      if(i===7){const tag=document.createElement('span');tag.className='tag '+(s==='Encerrado'?'done':s==='Cancelado'?'cancel':s==='Ativo'&&r.data_fim<=somarDias(hojeISO(),5)?'soon':'');tag.textContent=v;td.appendChild(tag);}
      else td.textContent=v;
      tr.appendChild(td);
    });
    const av=document.createElement('td'),tag=document.createElement('span');
    tag.className='tag '+(a?.situacao_averbacao==='AVERBAR'?'av':'noav');
    tag.textContent=r.cancelado_em?'Não aplicável':erroView?'Indisponível':a?.situacao_averbacao==='AVERBAR'?'AVERBAR':a?'Não averbar':'Não aplicável';
    av.appendChild(tag);tr.appendChild(av);
    const total=document.createElement('td');total.textContent=a&&!r.cancelado_em?String(a.total_dias):'—';tr.appendChild(total);
    const ciclo=document.createElement('td');ciclo.textContent=a&&!r.cancelado_em?`${formatarData(a.inicio_ciclo)} a ${formatarData(a.fim_ciclo)}`:'—';tr.appendChild(ciclo);
    if(ehAdmin()){
      const td=document.createElement('td'),b=document.createElement('div');b.className='edit-actions';
      if(!r.cancelado_em){
        const edit=document.createElement('button');edit.type='button';edit.className='secondary mini';edit.textContent='Editar';edit.addEventListener('click',()=>editarRegistro(r.id));b.appendChild(edit);
        const cancel=document.createElement('button');cancel.type='button';cancel.className='danger mini';cancel.textContent='Cancelar';cancel.addEventListener('click',()=>{void cancelarRegistro(r.id);});b.appendChild(cancel);
      }else{b.textContent='—';}
      td.appendChild(b);tr.appendChild(td);
    }
    tbody.appendChild(tr);
  });
  $('recordsInfo').textContent=`${totalRegistros} registro(s) encontrados no banco; ${pagina.length} nesta página. CSV completo inclui todos os registros dos filtros.`;
  $('recordsPageInfo').textContent=`Página ${paginaRegistros} de ${totalPaginas}`;
  $('recordsPrev').disabled=paginaRegistros<=1;
  $('recordsNext').disabled=paginaRegistros>=totalPaginas;
  $('exportCsv').disabled=!totalRegistros||exportandoRegistros;
}
async function exportarCsv() {
  if (exportandoRegistros || !totalRegistros || !dadosCarregados) return;
  const f = filtrosRegistrosAtuais(), contexto = contextoConsulta();
  const valida = () => contexto() && !cancelarCsvRegistros && JSON.stringify(f) === JSON.stringify(filtrosRegistrosAtuais());
  exportandoRegistros = true; cancelarCsvRegistros = false;
  $('exportCsv').disabled = true; $('recordsCancelExport').hidden = false;
  const linhas = [['Matrícula','QRA','Policial','Tipo','Início','Término','Dias','Situação','Averbação','Dias no ciclo','Início ciclo','Fim ciclo']];
  try {
    await percorrerPorId(() => consultaRegistrosFiltrada(f), async lote => {
      const av = await buscarAverbacoes(lote.filter(r=>!r.cancelado_em).map(r=>r.id),valida);
      conferirConsulta(valida);
      const mapa = new Map(av.map(a=>[String(a.afastamento_id),a]));
      for (const r of registrosDoLote(lote,f,av)) {
        const a = !r.cancelado_em ? mapa.get(String(r.id)) : null;
        const linha=[r.policiais?.matricula||'',r.policiais?.qra||'',r.policiais?.nome_completo||'',r.tipos_afastamento?.sigla||'',formatarData(r.data_inicio),formatarData(r.data_fim),r.dias,situacao(r),a?.situacao_averbacao||'Não aplicável',a?.total_dias??'',a?formatarData(a.inicio_ciclo):'',a?formatarData(a.fim_ciclo):''];
        linha.chaveData=r.data_inicio;linha.chaveId=r.id;linhas.push(linha);
      }
      $('recordsExportStatus').textContent = `Preparando CSV completo: ${linhas.length-1} registro(s)...`;
    },valida);
    conferirConsulta(valida);
    if (linhas.length === 1) throw new Error('Nenhum registro encontrado.');
    const ordenadas=linhas.slice(1).sort((a,b)=>b.chaveData.localeCompare(a.chaveData)||Number(b.chaveId)-Number(a.chaveId));
    baixarCsv([linhas[0],...ordenadas],'afastamentos_completo_'+hojeISO()+'.csv');
    $('recordsExportStatus').textContent = `CSV completo gerado: ${linhas.length-1} registro(s). A base pode mudar durante a consulta.`;
  } catch (error) {
    if (contexto()) $('recordsExportStatus').textContent = 'Exportação interrompida. Nenhum CSV parcial foi baixado. ' + (error.name==='AbortError'?'':erroAmigavel(error));
  } finally {
    exportandoRegistros = false; $('recordsCancelExport').hidden = true;
    if (contexto()) $('exportCsv').disabled = !totalRegistros;
  }
}
$('recordsCancelExport').addEventListener('click',()=>{cancelarCsvRegistros=true;});
