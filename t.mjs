import { createClient } from '@supabase/supabase-js';
const url=process.env.SUPABASE_URL, svc=process.env.SUPABASE_SERVICE_ROLE_KEY, pub=process.env.SUPABASE_PUBLISHABLE_KEY||process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const f=(k)=>(i,init)=>{const h=new Headers(init?.headers);if(k.startsWith('sb_')&&h.get('Authorization')===`Bearer ${k}`)h.delete('Authorization');h.set('apikey',k);return fetch(i,{...init,headers:h});};
const a=createClient(url,svc,{global:{fetch:f(svc)},auth:{persistSession:false}});
const {data:list}=await a.auth.admin.listUsers({perPage:100});
console.log(list.users.map(u=>({e:u.email,conf:u.email_confirmed_at,last:u.last_sign_in_at,ban:u.banned_until,created:u.created_at})));
