(() => {
  localStorage.clear();
  const mode = sessionStorage.getItem('phase3-mode') || 'public';
  const state = sessionStorage.getItem('phase3-state') || 'populated';
  const now = '2026-10-30T03:00:00.000Z';
  const user = {id:'visual-phase3',name:'SIMULATED — Alexandra Montgomery-Wellington, long agent name',email:'alexandra.montgomery.wellington.long.agent@example.invalid',source:'manual',emailConfirmed:true,onboardComplete:mode !== 'onboard',newLeadNotify:'off',newMessageReplyNotify:'email',weeklySummeryNotify:'off'};
  const messages = [
    {id:'email-1',conversationId:'email-1',leadId:'801',leadName:'SIMULATED — Alexandra Montgomery-Wellington, long conversation name',direction:'outbound',body:'SIMULATED — earlier reply. No message was delivered.',channel:'email',sentAt:'2026-10-29T12:00:00Z'},
    {id:'email-2',conversationId:'email-1',leadId:'801',leadName:'SIMULATED — Alexandra Montgomery-Wellington, long conversation name',direction:'inbound',body:'SIMULATED visual inquiry. I would like to review the property details before arranging a visit. This deliberately long message tests readable conversation density and wrapping. LongReferenceWithoutSpaces_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789\nSecond paragraph for preserved line breaks.',channel:'email',sentAt:now},
    {id:'sms-1',conversationId:'sms-2',leadId:'802',leadName:'SIMULATED — Jordan Example',direction:'outbound',body:'SIMULATED SMS sample. No delivery.',channel:'sms',sentAt:'2026-10-29T10:00:00Z'}
  ];
  const dashboard = {totalLeads:0,totalProperties:0,needsAttention:0,aiManagedLeads:0,leadsByStatus:[],leads:[],inboundMessages:[],recentActivity:[],fetchedAt:now};
  window.phase3Requests=[];
  window.phase3Delay=0;
  const originalFetch=window.fetch.bind(window);
  window.fetch=async (input,options={}) => {
    const url=new URL(typeof input==='string'?input:input.url,location.href);
    if (!url.pathname.startsWith('/api/') && !url.pathname.startsWith('/auth/')) return originalFetch(input,options);
    const method=options.method || 'GET';
    window.phase3Requests.push({path:url.pathname,method,body:options.body || null});
    const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
    if (url.pathname==='/api/auth/me') return mode==='public'?reply({error:'SIMULATED unauthenticated'},401):reply({user});
    if (method!=='GET') {
      if (window.phase3Delay) await new Promise(r=>setTimeout(r,window.phase3Delay));
      if (state==='callback-loading') return new Promise(()=>{});
      return reply({error:'SIMULATED rejection — no persistence, provider connection or delivery.'},422);
    }
    if (url.pathname==='/api/onboarding') return reply({gmailConnected:state==='connected'});
    if (url.pathname==='/api/dashboard') return reply(dashboard);
    if (url.pathname==='/api/properties') return reply([]);
    if (url.pathname==='/api/messages') {
      if (state==='loading') return new Promise(()=>{});
      if (state==='error') return reply({error:'SIMULATED inbox unavailable'},503);
      return reply(state==='empty'?[]:messages);
    }
    return reply({error:'Unconfigured SIMULATED boundary'},404);
  };
  document.addEventListener('DOMContentLoaded',()=>{
    const banner=document.createElement('div');
    banner.id='phase3-simulation-label';
    banner.textContent='SIMULATED-visual · synthetic fixtures · NOT E2E';
    banner.style.cssText='position:fixed;bottom:0;left:0;right:0;z-index:1000;background:#222f2a;color:#fffefa;font:11px/1.3 Arial,sans-serif;text-align:center;padding:5px;pointer-events:none';
    document.body.append(banner);
    document.addEventListener('click',event=>{
      const link=event.target.closest('a');
      if (link && new URL(link.href,location.href).origin!==location.origin) event.preventDefault();
    },true);
  });
})();
