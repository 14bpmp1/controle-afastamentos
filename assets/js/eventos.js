'use strict';

$('exportCsv').addEventListener('click',exportarCsv);
$('loginForm').addEventListener('submit',e=>{e.preventDefault();void entrar();});
$('afastamentoForm').addEventListener('submit',e=>{e.preventDefault();void salvarAfastamento();});
$('tipo').addEventListener('change',atualizarTipo);$('inicio').addEventListener('change',calcularTermino);$('dias').addEventListener('input',calcularTermino);
$('clearButton').addEventListener('click',limparFormulario);$('cancelEditButton').addEventListener('click',limparFormulario);
['filterText','filterPolicial','filterMes','filterAverbacao','filterTipo','filterInicio','filterFim','filterSituacao'].forEach(id=>$(id).addEventListener(id==='filterText'?'input':'change',()=>agendarConsultaRegistros(id==='filterText'?300:0)));
$('filterClear').addEventListener('click',()=>{['filterText','filterPolicial','filterMes','filterAverbacao','filterTipo','filterInicio','filterFim','filterSituacao'].forEach(id=>$(id).value='');agendarConsultaRegistros();});
$('recordsPrev').addEventListener('click',()=>{paginaRegistros--;void consultarRegistros();});
$('recordsNext').addEventListener('click',()=>{paginaRegistros++;void consultarRegistros();});$('refresh').addEventListener('click',()=>{void carregarDados();});$('logout').addEventListener('click',()=>{void sair();});
