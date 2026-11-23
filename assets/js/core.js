'use strict';

const $ = id => document.getElementById(id);
let db = null, usuarioAtual = null, perfilAtual = null;
let policiais = [], tipos = [], registros = [], averbacoes = [], erroView = null;
let todosPoliciais = [], todosTipos = [], editPolicialId = null, editTipoId = null;
let editandoId = null, auditoria = [];
const TAMANHO_PAGINA=50, TAMANHO_LOTE=1000, MAX_REGISTROS=20000;
let paginaRegistros=1, registrosTruncados=false, averbacoesTruncadas=false;
const ehAdmin = () => perfilAtual?.perfil === "administrador" && perfilAtual?.ativo === true;
const setMsg = (id, msg, erro=false) => { const e=$(id); e.textContent=msg; e.className='msg '+(erro?'error':'ok'); };
function hojeISO(){const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');}
function somarDias(iso,n){const d=new Date(iso+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
function formatarData(s){return s?s.split('-').reverse().join('/'):'';}
function opcao(v,t){const e=document.createElement('option');e.value=v;e.textContent=t;return e;}
