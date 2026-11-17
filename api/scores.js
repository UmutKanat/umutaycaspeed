import { list, put } from '@vercel/blob';
import { timingSafeEqual } from 'node:crypto';
const prefix='shared-v1/';
const seed={id:'initial-2026-11-03',date:'2026-11-03',u:5,a:15};
const valid=e=>e&&/^[a-zA-Z0-9_-]{1,100}$/.test(e.id)&&/^\d{4}-\d{2}-\d{2}$/.test(e.date)&&new Date(e.date+'T12:00:00Z').toISOString().slice(0,10)===e.date&&[e.u,e.a].every(n=>Number.isSafeInteger(n)&&n>=0&&n<=99999);
export async function readEntries(){
  const records=new Map([[seed.id,seed]]),deleted=new Set();let cursor;
do {const page=await list({prefix,cursor,limit:1000});for(const b of page.blobs){const bits=b.pathname.slice(prefix.length).split('/');if(bits[0]==='delete')deleted.add(bits[1].replace('.json',''));if(bits[0]==='add'){try{const e=JSON.parse(Buffer.from(bits[1].replace('.json',''),'base64url').toString());if(valid(e))records.set(e.id,e);}catch{}}}cursor=page.hasMore?page.cursor:undefined;}while(cursor);
return [...records.values()].filter(e=>!deleted.has(e.id)).sort((a,b)=>b.date.localeCompare(a.date)||b.id.localeCompare(a.id));
}
export default async function handler(req,res){
res.setHeader('Cache-Control','no-store');
  try{
if(req.method==='GET')return res.status(200).json({entries:await readEntries()});
if(req.method!=='POST')return res.status(405).json({error:'Yöntem desteklenmiyor.'});
const origin=req.headers.origin;if(origin&&new URL(origin).host!==req.headers.host)return res.status(403).json({error:'Geçersiz kaynak.'});
const expected=process.env.SPEED_EDIT_CODE;const supplied=decodeURIComponent(String(req.headers['x-edit-code']||'')).normalize('NFC');
if(!expected)return res.status(503).json({error:'Düzenleme kodu yapılandırılmamış.'});
const a=Buffer.from(expected),b=Buffer.from(supplied);if(a.length!==b.length||!timingSafeEqual(a,b))return res.status(401).json({error:'Düzenleme kodu yanlış.'});
    const body=typeof req.body==='string'?JSON.parse(req.body):req.body;
if(!Array.isArray(body?.operations)||body.operations.length>200)return res.status(400).json({error:'Geçersiz kayıt listesi.'});
for(const op of body.operations){if(op.type==='add'){if(!valid(op.entry))return res.status(400).json({error:'Geçersiz skor.'});}else if(op.type!=='delete'||!/^[a-zA-Z0-9_-]{1,100}$/.test(op.id))return res.status(400).json({error:'Geçersiz işlem.'});}
for(const op of body.operations){const path=op.type==='add'?prefix+'add/'+Buffer.from(JSON.stringify({id:op.entry.id,date:op.entry.date,u:op.entry.u,a:op.entry.a})).toString('base64url')+'.json':prefix+'delete/'+op.id+'.json';await put(path,JSON.stringify(op),{access:'private',addRandomSuffix:false,allowOverwrite:true,contentType:'application/json'});}
return res.status(200).json({entries:await readEntries()});
}catch(e){console.error('Score sync failed',e.name);return res.status(500).json({error:'Ortak arşive ulaşılamadı. Kayıtlarınız cihazınızda korunuyor.'});}
}
