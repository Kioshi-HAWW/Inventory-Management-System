"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Building2, Loader2, Zap } from "lucide-react";

export default function BusinessOnboarding({ email }: { email: string }) {
  const [name,setName]=useState(""); const [phone,setPhone]=useState(""); const [busy,setBusy]=useState(false); const [error,setError]=useState("");
  const router=useRouter();
  async function submit(e:React.FormEvent){e.preventDefault();setBusy(true);setError("");try{const supabase=createClient();const {error}=await supabase.rpc("create_business",{p_name:name,p_phone:phone||null,p_email:email||null});if(error)throw error;router.refresh();}catch(err){setError(err instanceof Error?err.message:"Could not create business workspace.");}finally{setBusy(false);}}
  return <main className="auth-shell"><section className="auth-card"><div className="brand-mark"><Zap size={24}/></div><p className="eyebrow">ONE-TIME WORKSPACE SETUP</p><h1>Set up your business</h1><p className="muted">Create your private workspace. You will be its owner and can invite your team as the user-management module is enabled.</p><form className="form-stack" onSubmit={submit}><label>Business name<div className="input-wrap"><Building2 size={17}/><input required value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Rout Electrical Works"/></div></label><label>Business phone (optional)<div className="input-wrap"><input value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+91..."/></div></label><button className="primary-button" disabled={busy}>{busy?<Loader2 className="spin" size={18}/>:null}Create business workspace</button></form>{error&&<div className="notice error">{error}</div>}<p className="tiny muted">Your data is isolated to this business account through database security policies.</p></section></main>;
}
