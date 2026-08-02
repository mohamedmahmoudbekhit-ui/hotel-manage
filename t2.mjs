import { createClient } from '@supabase/supabase-js';
const url=process.env.SUPABASE_URL, svc=process.env.SUPABASE_SERVICE_ROLE_KEY, pub=process.env.SUPABASE_PUBLISHABLE_KEY;
const mk=(k)=>createClient(url,k,{global:{fetch:(i,init)=>{const h=new Headers(init?.headers);if(k.startsWith('sb_')&&h.get('Authorization')===`Bearer ${k}`)h.delete('Authorization');h.set('apikey',k);return fetch(i,{...init,headers:h});}},auth:{persistSession:false}});
const a=mk(svc), p=mk(pub);
const email=`test.emp.${Date.now()}@example.com`, pw='Passw0rdTest';
// step 1: invite pre-creates account without password
const c1=await a.auth.admin.createUser({email, email_confirm:true});
console.log('precreate', c1.error?.message, c1.data?.user?.id);
// step 2: activation attempts createUser again
const c2=await a.auth.admin.createUser({email, password:pw, email_confirm:true});
console.log('activate-create err=', c2.error?.message, 'user=', c2.data?.user?.id);
if(!c2.data?.user){
  const l=await a.auth.admin.generateLink({type:'recovery', email});
  console.log('link err', l.error?.message, 'uid', l.data?.user?.id);
  if(l.data?.user?.id){const u=await a.auth.admin.updateUserById(l.data.user.id,{password:pw,email_confirm:true});console.log('upd err',u.error?.message);}
}
const s=await p.auth.signInWithPassword({email,password:pw});
console.log('SIGNIN', s.error?.message, !!s.data?.session);
