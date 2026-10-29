/* 닥터빌 세미나 신청 솔루션 — 신청 사이트(data-app="member") / 관리자 사이트(data-app="admin") 공용 스크립트 */
(function(){
'use strict';
const APP=document.body.dataset.app==='admin'?'admin':'member';
const CFG=window.DV_CONFIG||{};
/* 단가표는 코드에 두지 않고 Supabase price_tiers 테이블(로그인 사용자만 조회)에서 불러옵니다 */
const PRICE={L:[],D:[],R:[]};
const ST={req:{label:'신청',ch:'신'},rev:{label:'검토중',ch:'검'},ok:{label:'확정',ch:'확'},adj:{label:'조정',ch:'조'}};
const STATUS_ORDER=['req','rev','adj','ok'];
const TYPES=['줌 라이브세미나','현장 라이브세미나','웹심포지움'];
const MODES=['생방송','재송출','녹화','녹화송출'];
const SURVEYS=['인식형','리뷰형','분석형','적용형'];
const DOW=['월','화','수','목','금'];
const CAT_KINDS=['질환','진료과'];
const CAT_PRESET={
  '질환':['고혈압','이상지질혈증','당뇨병','비만','대사증후군','골다공증','갑상선질환','심부전','심방세동','관상동맥질환','말초동맥질환','뇌졸중','치매','파킨슨병','뇌전증','편두통','우울증','불안장애','불면증','조현병','ADHD','천식','만성폐쇄성폐질환(COPD)','알레르기비염','위식도역류질환','기능성소화불량','과민성장증후군','염증성장질환','지방간','만성간질환','B형간염','만성콩팥병','전립선비대증','과민성방광','발기부전','골관절염','류마티스관절염','통풍','근골격계 통증','신경병증성 통증','아토피피부염','건선','여드름','대상포진','인플루엔자','감염질환','백신·예방접종','빈혈','혈전증','폐암','유방암','위암','대장암','간암','갱년기','안구건조증','녹내장','황반변성'],
  '진료과':['내과','순환기내과','내분비내과','소화기내과','호흡기내과','신장내과','감염내과','류마티스내과','혈액종양내과','가정의학과','신경과','정신건강의학과','정형외과','신경외과','일반외과','흉부외과','산부인과','소아청소년과','비뇨의학과','피부과','안과','이비인후과','재활의학과','마취통증의학과','영상의학과','진단검사의학과','응급의학과','성형외과','방사선종양학과','핵의학과','직업환경의학과','치과','한의과']
};
const MAX_ITEMS=10,MAX_SPK=5;
const isSympo=f=>f&&f.type==='웹심포지움';
const KIND={new:'신규 접수',changed:'신청 변경',status:'상태 변경',assign:'세미나 배정'};
/* 주요 제약사 목록(샘플) — 공식 등록 목록으로 교체하세요 */
const PHARMA=['GC녹십자','HK이노엔','JW중외제약','SK케미칼','경동제약','경보제약','고려제약','광동제약','구주제약','국제약품','대우제약','대웅바이오','대웅제약','대원제약','대한뉴팜','대한약품','대화제약','동구바이오제약','동국제약','동성제약','동아에스티','동화약품','마더스제약','명인제약','바이넥스','보령','부광약품','비씨월드제약','삼아제약','삼일제약','삼진제약','삼천당제약','서울제약','셀트리온제약','신일제약','신풍제약','아주약품','안국약품','알리코제약','알보젠코리아','영진약품','우리들제약','위더스제약','유나이티드제약','유니메드제약','유한양행','이연제약','일동제약','일양약품','제일약품','조아제약','종근당','종근당바이오','진양제약','코오롱제약','테라젠이텍스','하나제약','한국글로벌제약','한국맥널티','한국유나이티드제약','한국콜마','한국파마','한국프라임제약','한독','한림제약','한미약품','한올바이오파마','한풍제약','현대약품','환인제약','휴온스','휴텍스제약',
'길리어드사이언스코리아','바이엘코리아','사노피-아벤티스 코리아','암젠코리아','한국MSD','한국노바티스','한국노보노디스크제약','한국다케다제약','한국로슈','한국릴리','한국먼디파마','한국메나리니','한국베링거인겔하임','한국비아트리스','한국세르비에','한국아스텔라스제약','한국아스트라제네카','한국애브비','한국얀센','한국에자이','한국오츠카제약','한국유씨비제약','한국쿄와기린','한국페링제약','한국화이자제약','한국BMS제약','한국GSK','한국머크'];
const ADMMAP={time:'time_text',cid:'cid',surveyDist:'survey_dist',vendor:'vendor',channel:'channel',manager:'manager',pmInternal:'pm_internal',applicants:'applicants',attendees:'attendees',surveyParticipants:'survey_participants',privacy:'privacy',questions:'questions',replay:'replay',basePrice:'base_price',surveyPay:'survey_pay',surveyBill:'survey_bill',finalPrice:'final_price'};
const ADMNUM=new Set(['applicants','attendees','surveyParticipants','basePrice','surveyPay','surveyBill','finalPrice']);

let sb=null;
const S={vendors:[],vpoll:null,mem:{list:[],q:'',role:'all',st:'all',loaded:false},memDrawer:null,me:null,user:null,view:'login',tab:'cal',y:0,m:0,apps:{},locks:new Set(),sel:null,mode:null,form:null,editing:false,confirmCancel:false,notis:[],chan:null,err:'',busy:false,
  customCos:[],su:{coMode:'search',coQ:'',coSel:''},al:{scope:'month',y:0,m:0,from:'',to:'',q:'',st:'all'},drawer:null,pref:null};

const $=(id)=>document.getElementById(id);
const esc=(s)=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad=(n)=>String(n).padStart(2,'0');
const ymd=(d)=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
const todayStr=ymd(new Date());
const won=(v)=>Number(v).toLocaleString('ko-KR')+'원';
const fmtN=(v)=>(v===''||v==null||isNaN(Number(v)))?String(v==null?'':v):Number(v).toLocaleString('ko-KR');
const isAdmin=()=>!!(S.me&&S.me.role==='admin');
const isVendor=()=>!!(S.me&&S.me.role==='vendor');
const idEmail=(id)=>id+'@'+(CFG.LOGIN_EMAIL_DOMAIN||'seminar.example.com');
const nOrBlank=(v)=>(v===''||v==null)?'':(isNaN(Number(v))?v:Number(v));
(function(){const d=new Date();d.setMonth(d.getMonth()+1);S.y=S.al.y=d.getFullYear();S.m=S.al.m=d.getMonth();})();
let toastT=null;
function toast(msg){const t=$('toast');t.textContent=msg;t.hidden=false;clearTimeout(toastT);toastT=setTimeout(()=>{t.hidden=true;},3600);}
function typeTag(t){if(t==='웹심포지움')return'<span class="tag sympo">심포</span>';if(t==='현장 라이브세미나')return'<span class="tag site">현장</span>';return'<span class="tag zoom">줌</span>';}
function sortKey(k){const p=k.split('_');return p[0]+(p[1]==='L'?'0':'1')+p[2];}
function slotLabel(key){
  const [ds,meal,n]=key.split('_');const d=new Date(ds+'T00:00:00');
  return (d.getMonth()+1)+'월 '+d.getDate()+'일('+'일월화수목금토'[d.getDay()]+') '+(meal==='L'?'점심':'저녁')+' · '+n+'번 슬롯';
}
const spName=x=>x.spk+(x.aff?' ('+x.aff+')':'');
function speakersText(a,sep){
  const all=(a.speakers||[]).filter(x=>x.spk||x.aff);
  const chair=all.find(x=>x.role==='chair');const sp=all.filter(x=>x.role!=='chair');
  const out=[];if(chair)out.push('[좌장] '+spName(chair));
  sp.forEach(x=>out.push((x.chair?'[좌장 겸 연자] ':'')+spName(x)+(x.topic?' – '+x.topic:'')));
  return out.join(sep);
}
function catKind(n){for(const k of CAT_KINDS){if(CAT_PRESET[k].includes(n))return k;}const c=(S.customCats||[]).find(x=>x.name===n);return c?c.kind:'';}
function catLabel(n){if(!n)return'';const k=catKind(n);return k?'['+k+'] '+n:n;}
function calcPrice(f){
  if(f.acad==='비학술')return{ok:false,excluded:true,basis:'비학술',msg:'비학술 행사는 예상 금액 산정 대상이 아닙니다.'};
  const col=f.mode==='재송출'?'R':(f.type==='웹심포지움'?'D':'L');
  const colName=col==='R'?'재송출':(col==='D'?'웹심포':'라이브세미나');
  const list=PRICE[col];
  if(!list.length)return{ok:false,basis:colName+' 단가',msg:'단가 정보가 아직 등록되지 않았습니다. 운영팀에 문의하세요.'};
  const n=parseInt(f.recruit,10);
  const max=list[list.length-1].tier;
  if(!n||n<=0)return{ok:false,basis:colName+' 단가',msg:'모집 인원을 입력하면 자동 계산됩니다.'};
  if(n>max)return{ok:false,basis:colName+' · '+max.toLocaleString('ko-KR')+'명 초과',msg:max.toLocaleString('ko-KR')+'명 초과 규모는 별도 협의가 필요합니다.'};
  const t=list.find(x=>x.tier>=n);
  return{ok:true,v:t.price,basis:colName+' · '+t.tier.toLocaleString('ko-KR')+'명 구간'};
}
async function loadPrices(){
  const r=await sb.from('price_tiers').select('col,tier,price').order('tier');
  PRICE.L=[];PRICE.D=[];PRICE.R=[];
  if(!r.error)r.data.forEach(x=>{if(PRICE[x.col])PRICE[x.col].push({tier:x.tier,price:Number(x.price)});});
  if(S.mode==='form'&&$('price'))$('price').innerHTML=priceHtml();
}
function basePrice(a){if(a.adm.basePrice!=='')return Number(a.adm.basePrice);if(a.acad==='비학술')return'산정 제외';return a.priceList!=null?a.priceList:'';}
function finalPrice(a){if(a.adm.finalPrice!=='')return Number(a.adm.finalPrice);const b=basePrice(a);if(typeof b!=='number')return'';return b+(Number(a.adm.surveyBill)||0);}

/* ---------- data mapping ---------- */
function fromRow(r){
  let ad=r.application_admin;if(Array.isArray(ad))ad=ad[0];ad=ad||{};
  const adm={};Object.keys(ADMMAP).forEach(k=>{const v=ad[ADMMAP[k]];adm[k]=v==null?'':String(v);});
  return{id:r.id,key:r.slot_key,date:r.event_date,meal:r.meal,slot:r.slot,company:r.company,userId:r.user_id,applicant:r.applicant||'',status:r.status,acad:r.acad,type:r.type,mode:r.mode,cat:r.category||'',
    leadItem:r.lead_item||'',item:r.item||'',title:r.title,topic:r.topic||'',speakers:Array.isArray(r.speakers)?r.speakers:[],recruit:r.recruit==null?'':String(r.recruit),surveyOn:!!r.survey_on,survey:r.survey||'',
    pm:r.pm||'',adjustNote:r.adjust_note||'',adminRegistered:!!r.admin_registered,priceList:r.price_list,vendorId:r.vendor_id==null?null:r.vendor_id,adm};
}
function toRow(f,key){
  const [date,meal,n]=key.split('_');const p=calcPrice(f);
  return{event_date:date,meal,slot:Number(n),acad:f.acad,type:f.type,mode:f.mode,category:f.cat,lead_item:f.leadItem.trim(),item:f.items.map(x=>x.trim()).filter(Boolean).join(', '),title:f.title.trim(),topic:f.topic.trim(),
    speakers:speakersOut(f),recruit:f.recruit===''?null:parseInt(f.recruit,10),
    survey_on:!!f.surveyOn,survey:f.surveyOn?f.survey:'',pm:f.pm.trim(),price_list:p.ok?p.v:null};
}
function speakersOut(f){
  const sym=isSympo(f);const out=[];
  if(sym&&f.chair.mode==='sep'&&(f.chair.spk.trim()||f.chair.aff.trim()))out.push({role:'chair',spk:f.chair.spk.trim(),aff:f.chair.aff.trim()});
  f.speakers.forEach((s,i)=>{
    const o={spk:s.spk.trim(),aff:s.aff.trim()};if(!o.spk&&!o.aff)return;
    if(sym){if((s.topic||'').trim())o.topic=s.topic.trim();if(f.chair.mode==='spk'&&f.chair.idx===i)o.chair=true;}
    out.push(o);
  });
  return out;
}
function formFromApp(x){
  const all=(x.speakers||[]).map(s=>Object.assign({},s));
  const ch=all.find(s=>s.role==='chair');let sp=all.filter(s=>s.role!=='chair').map(s=>({spk:s.spk||'',aff:s.aff||'',topic:s.topic||'',chair:!!s.chair}));
  const ci=sp.findIndex(s=>s.chair);
  const chair=ch?{mode:'sep',idx:-1,spk:ch.spk||'',aff:ch.aff||''}:(ci>=0?{mode:'spk',idx:ci,spk:'',aff:''}:{mode:'none',idx:-1,spk:'',aff:''});
  sp=sp.map(s=>({spk:s.spk,aff:s.aff,topic:s.topic}));
  const f={acad:x.acad,type:x.type,mode:x.mode,company:x.company,cat:x.cat,leadItem:x.leadItem,items:x.item?x.item.split(/\s*,\s*/).filter(Boolean):[''],title:x.title,topic:x.topic,speakers:sp.length?sp:[{spk:'',aff:'',topic:''}],chair,recruit:x.recruit,surveyOn:x.surveyOn,survey:x.survey,pm:x.pm};
  if(!f.items.length)f.items=[''];
  padSympo(f);return f;
}
function padSympo(f){if(isSympo(f))while(f.speakers.length<2)f.speakers.push({spk:'',aff:'',topic:''});}
function errMsg(e,fallback){
  if(!e)return fallback;
  if(e.code==='23505')return'방금 다른 신청이 접수된 슬롯입니다. 다른 빈자리를 선택하세요.';
  if(e.message&&/[가-힣]/.test(e.message))return e.message;
  return fallback;
}

/* ---------- data access ---------- */
let refreshT=null;
function scheduleRefresh(){clearTimeout(refreshT);refreshT=setTimeout(refreshApps,250);}
function fromVendorRow(r){
  const adm={};Object.keys(ADMMAP).forEach(k=>{adm[k]='';});
  adm.time=r.time_text||'';adm.cid=r.cid||'';adm.channel=r.channel||'';adm.manager=r.manager||'';adm.pmInternal=r.pm_internal||'';adm.surveyDist=r.survey_dist||'';adm.replay=r.replay||'';
  return{id:r.slot_key,key:r.slot_key,date:r.event_date,meal:r.meal,slot:r.slot,company:r.company,userId:null,applicant:'',status:r.status,acad:r.acad,type:r.type,mode:r.mode,cat:r.category||'',
    leadItem:r.lead_item||'',item:r.item||'',title:r.title,topic:r.topic||'',speakers:Array.isArray(r.speakers)?r.speakers:[],recruit:r.recruit==null?'':String(r.recruit),surveyOn:!!r.survey_on,survey:r.survey||'',
    pm:r.pm||'',adjustNote:r.adjust_note||'',adminRegistered:false,priceList:null,vendorId:null,adm};
}
async function loadVendors(){const r=await sb.from('vendors').select('*').order('name');if(!r.error)S.vendors=r.data;}
const vendorName=(id)=>{const v=S.vendors.find(x=>x.id===id);return v?v.name:'';};
async function refreshApps(){
  if(!S.me)return;
  if(isVendor()){
    const [a,l]=await Promise.all([sb.rpc('vendor_seminars'),sb.from('slot_locks').select('slot_key').limit(10000)]);
    if(a.error||l.error){toast('일정 데이터를 불러오지 못했습니다. 새로고침해 주세요.');return;}
    S.apps={};a.data.forEach(r=>{S.apps[r.slot_key]=fromVendorRow(r);});
    S.locks=new Set(l.data.map(x=>x.slot_key));
    if(S.view!=='app')return;
    if(S.tab==='cal'){renderCal();renderSummary();if(S.sel)selectSlot(S.sel);}else if(S.tab==='mine')renderMine();
    return;
  }
  const sel=isAdmin()?'*, application_admin(*)':'*';
  const [a,l]=await Promise.all([sb.from('applications').select(sel).order('event_date').limit(5000),sb.from('slot_locks').select('slot_key').limit(10000)]);
  if(a.error||l.error){toast('일정 데이터를 불러오지 못했습니다. 새로고침해 주세요.');return;}
  const prev=S.apps;S.apps={};a.data.forEach(r=>{S.apps[r.slot_key]=fromRow(r);});
  S.locks=new Set(l.data.map(x=>x.slot_key));
  if(S.view!=='app')return;
  if(S.tab==='cal'){renderCal();renderSummary();
    if(S.sel){const was=prev[S.sel],now=S.apps[S.sel];
      if(S.mode==='form'&&!S.editing&&(now||S.locks.has(S.sel)))selectSlot(S.sel);
      else if(S.mode!=='form'&&JSON.stringify(was)!==JSON.stringify(now))selectSlot(S.sel);}}
  else if(S.tab==='mine')renderMine();
  else if(S.tab==='all'&&!S.drawer)renderLedger();
}
async function loadNotis(){
  const r=await sb.from('notifications').select('*').eq('user_id',S.me.id).order('created_at',{ascending:false}).limit(100);
  if(r.error)return;
  S.notis=r.data.map(n=>({id:n.id,text:n.text,key:n.slot_key,kind:n.kind,read:n.read,at:Date.parse(n.created_at)}));
  renderTop();if(S.tab==='noti')renderNoti();
}
function subscribe(){
  if(S.chan)sb.removeChannel(S.chan);
  let ch=sb.channel('dv-'+S.me.id)
    .on('postgres_changes',{event:'*',schema:'public',table:'applications'},scheduleRefresh)
    .on('postgres_changes',{event:'*',schema:'public',table:'slot_locks'},scheduleRefresh)
    .on('postgres_changes',{event:'INSERT',schema:'public',table:'notifications',filter:'user_id=eq.'+S.me.id},(p)=>{
      const n=p.new;alertNew({id:n.id,text:n.text,key:n.slot_key,kind:n.kind});loadNotis();});
  if(isAdmin())ch=ch.on('postgres_changes',{event:'*',schema:'public',table:'application_admin'},scheduleRefresh);
  S.chan=ch.subscribe();
  clearInterval(S.vpoll);if(isVendor())S.vpoll=setInterval(()=>{if(!document.hidden)refreshApps();},60000);
}

/* ---------- alerts: 화면 팝업 · 알림음 · 윈도우(브라우저) 알림 ---------- */
let actx=null;
function unlockAudio(){try{if(!actx){const AC=window.AudioContext||window.webkitAudioContext;if(AC)actx=new AC();}if(actx&&actx.state==='suspended')actx.resume();}catch(e){}}
function chime(){try{unlockAudio();if(!actx)return;const t=actx.currentTime,o=actx.createOscillator(),g=actx.createGain();o.type='sine';o.frequency.setValueAtTime(880,t);o.frequency.setValueAtTime(1175,t+0.13);g.gain.setValueAtTime(0.0001,t);g.gain.exponentialRampToValueAtTime(0.18,t+0.02);g.gain.exponentialRampToValueAtTime(0.0001,t+0.45);o.connect(g);g.connect(actx.destination);o.start(t);o.stop(t+0.47);}catch(e){}}
function loadPref(){try{const v=JSON.parse(localStorage.getItem('dv_noti_pref')||'null');if(v)return Object.assign({pop:true,sound:true,desktop:true},v);}catch(e){}return{pop:true,sound:true,desktop:true};}
function savePref(){try{localStorage.setItem('dv_noti_pref',JSON.stringify(S.pref));}catch(e){}}
S.pref=loadPref();
const canDesktop=()=>('Notification' in window);
function showPop(n){
  const host=$('pops');if(!host)return;const el=document.createElement('div');el.className='pop';el.setAttribute('role','status');
  el.innerHTML='<div class="pt"><span class="kchip k-'+esc(n.kind||'x')+'">'+esc(KIND[n.kind]||'알림')+'</span><button type="button" class="px" aria-label="알림 닫기">×</button></div><div class="pm">'+esc(n.text)+'</div>'+(n.key?'<div><button type="button" class="btn sm" data-goto="'+esc(n.key)+'">보기</button></div>':'');
  el.querySelector('.px').addEventListener('click',()=>el.remove());
  el.addEventListener('click',(e)=>{if(e.target.closest('[data-goto]'))el.remove();});
  host.prepend(el);while(host.children.length>3)host.lastChild.remove();
  setTimeout(()=>{el.remove();},9000);
}
function desktopNotify(n){
  if(!S.pref.desktop||!canDesktop()||Notification.permission!=='granted')return;
  try{const nt=new Notification('닥터빌 세미나 · '+(KIND[n.kind]||'알림'),{body:n.text,tag:'dv-'+(n.id||Date.now())});
    nt.onclick=()=>{window.focus();if(n.key)gotoSlot(n.key);nt.close();};}catch(e){}
}
function alertNew(n){if(S.pref.pop)showPop(n);if(S.pref.sound)chime();if(document.hidden||!S.pref.pop)desktopNotify(n);}

/* ---------- header ---------- */
function renderTop(){
  let h='<div class="brand">DoctorVille<small>'+(APP==='admin'?'세미나 관리자':'세미나 신청')+'</small></div>';
  if(S.me){
    const unread=S.notis.filter(n=>!n.read).length;
    const tab=(id,label,extra)=>'<button type="button" data-tab="'+id+'"'+(S.tab===id?' aria-current="page"':'')+'>'+label+(extra||'')+'</button>';
    h+='<nav class="tabs" aria-label="메뉴">'+(APP==='admin'?tab('cal','일정 관리')+tab('all','전체 신청 현황')+tab('members','회원 관리'):isVendor()?tab('cal','배정 일정')+tab('mine','배정 목록'):tab('cal','일정 신청')+tab('mine','내 신청 현황'))+tab('noti','알림',unread?'<span class="badge">'+unread+'</span>':'')+'</nav>';
    h+='<div class="who"><span class="co">'+esc(S.me.company)+'</span><span>'+esc(S.me.name)+' 님</span>'+(isAdmin()?'<span class="role">관리자</span>':'')+(isVendor()?'<span class="role" style="border-color:#60A5FA;color:#BFDBFE">외주사</span>':'')+'<button type="button" class="btn-ghost-bar" data-act="logout">로그아웃</button></div>';
  }
  $('topbar').innerHTML=h;
}

/* ---------- auth ---------- */
function renderLogin(){
  const admin=APP==='admin';
  $('main').innerHTML='<div class="auth"><form class="card" id="loginForm" novalidate>'
  +'<h1>'+(admin?'관리자 로그인':'로그인')+'</h1><p class="sub" style="margin:0">'+(admin?'관리자 권한이 있는 계정만 이용할 수 있습니다.':'소속 회사의 세미나 일정만 상세히 보입니다.')+'</p>'
  +'<div class="fld"><label for="li-id">아이디</label><input id="li-id" autocomplete="username" required></div>'
  +'<div class="fld"><label for="li-pw">비밀번호</label><input id="li-pw" type="password" autocomplete="current-password" required></div>'
  +(S.err?'<div class="err" role="alert">'+esc(S.err)+'</div>':'')
  +'<button class="btn primary" type="submit" id="li-btn">로그인</button>'
  +(admin?'':'<div style="display:flex;gap:6px;align-items:center;font-size:13px;color:var(--ink-2)">계정이 없으신가요? <button type="button" class="link" data-act="goSignup">회원가입</button></div>')
  +'</form></div>';
}
async function loadCustomCos(){
  const r=await sb.from('companies').select('name').limit(5000);
  S.customCos=r.error?[]:r.data.map(x=>x.name);
  if(S.view==='signup'&&!S.su.coSel)renderCoPicker();
}
function renderSignup(){
  S.su={coMode:'search',coQ:'',coSel:''};
  $('main').innerHTML='<div class="auth"><form class="card" id="signupForm" novalidate>'
  +'<h1>회원가입</h1>'
  +'<div class="fld"><label for="su-id">아이디 <span class="req-mark">*</span></label><input id="su-id" placeholder="영문 소문자·숫자 4~20자" autocomplete="username"></div>'
  +'<div class="row2"><div class="fld"><label for="su-pw">비밀번호 <span class="req-mark">*</span></label><input id="su-pw" type="password" placeholder="8자 이상" autocomplete="new-password"></div>'
  +'<div class="fld"><label for="su-pw2">비밀번호 확인 <span class="req-mark">*</span></label><input id="su-pw2" type="password" autocomplete="new-password"></div></div>'
  +'<div class="fld"><label for="su-name">이름 <span class="req-mark">*</span></label><input id="su-name"></div>'
  +'<div class="fld"><span class="lbl">회사(소속) <span class="req-mark">*</span></span><div class="copick" id="coPicker"></div></div>'
  +'<div class="row2"><div class="fld"><label for="su-dept">부서</label><input id="su-dept"></div>'
  +'<div class="fld"><label for="su-mail">이메일</label><input id="su-mail" type="email"></div></div>'
  +'<div class="err" role="alert" id="su-err" hidden></div>'
  +'<button class="btn primary" type="submit" id="su-btn">가입하고 로그인</button>'
  +'<button type="button" class="link" data-act="goLogin" style="align-self:flex-start">로그인으로 돌아가기</button>'
  +'</form></div>';
  renderCoPicker();loadCustomCos();
}
function coMatches(q){
  q=q.trim().toLowerCase().replace(/\s+/g,'');if(!q)return[];
  const all=PHARMA.map(n=>({n,src:'제약사 목록'})).concat(S.customCos.filter(n=>!PHARMA.includes(n)).map(n=>({n,src:'직접입력 등록'})));
  return all.filter(o=>o.n.toLowerCase().replace(/\s+/g,'').includes(q)).slice(0,10);
}
function renderCoResults(){
  const el=$('coResults');if(!el)return;const q=S.su.coQ;
  if(!q.trim()){el.innerHTML='<div class="none">회사명을 입력하면 목록에서 찾습니다.</div>';return;}
  const r=coMatches(q);
  el.innerHTML=(r.length?r.map(o=>'<button type="button" data-co="'+esc(o.n)+'"><span>'+esc(o.n)+'</span><span class="src">'+o.src+'</span></button>').join(''):'<div class="none">검색 결과가 없습니다.</div>')
   +'<button type="button" data-act="coCustom"><span>찾는 회사가 없나요? <b>직접 입력</b></span><span class="src">'+esc(q.trim())+'</span></button>';
}
function renderCoPicker(){
  const el=$('coPicker');if(!el)return;const su=S.su;
  if(su.coSel){el.innerHTML='<div class="cochip"><span><b>'+esc(su.coSel)+'</b>'+(su.coMode==='custom'?' <span style="font-size:12px;color:var(--ink-3)">· 직접 입력</span>':'')+'</span><button type="button" class="btn sm" data-act="coChange">변경</button></div>';return;}
  if(su.coMode==='custom'){
    el.innerHTML='<input id="su-co-custom" aria-label="회사명 직접 입력" placeholder="회사명을 정확히 입력하세요" value="'+esc(su.coQ)+'" style="height:40px;border:1px solid var(--line);border-radius:8px;padding:0 12px;background:var(--surface);color:var(--ink)">'
     +'<div style="display:flex;gap:8px"><button type="button" class="btn primary sm" data-act="coCustomOk">이 이름으로 사용</button><button type="button" class="btn sm" data-act="coSearch">목록에서 검색</button></div>'
     +'<span style="font-size:12px;color:var(--ink-3)">직접 입력한 회사명은 다음 가입자의 검색 목록에 추가됩니다.</span>';
    $('su-co-custom').focus();return;
  }
  el.innerHTML='<input id="su-co-q" type="search" aria-label="제약사 검색" placeholder="제약사명 검색 (예: 한미, 종근당)" value="'+esc(su.coQ)+'" autocomplete="off" style="height:40px;border:1px solid var(--line);border-radius:8px;padding:0 12px;background:var(--surface);color:var(--ink)"><div class="coresults" id="coResults"></div>';
  renderCoResults();
}
async function loadProfile(uid){const r=await sb.from('profiles').select('*').eq('id',uid).single();return r.error?null:r.data;}
async function doLogin(id,pw){
  id=(id||'').trim().toLowerCase();
  if(!id||!pw){S.err='아이디와 비밀번호를 입력하세요.';renderLogin();return;}
  if(!/^[a-z0-9]{3,20}$/.test(id)){S.err='아이디 또는 비밀번호가 올바르지 않습니다.';renderLogin();return;}
  $('li-btn').disabled=true;
  const r=await sb.auth.signInWithPassword({email:idEmail(id),password:pw});
  if(r.error){S.err=/confirm/i.test(r.error.message)?'이메일 확인이 필요한 계정입니다. 관리자에게 문의하세요.':'아이디 또는 비밀번호가 올바르지 않습니다.';renderLogin();return;}
  await enter(r.data.user);
}
async function enter(user){
  const p=await loadProfile(user.id);
  if(!p){await sb.auth.signOut();S.err='회원 정보를 찾을 수 없습니다. 관리자에게 문의하세요.';renderLogin();return;}
  if(p.status==='suspended'){await sb.auth.signOut();S.err='이용이 정지된 계정입니다. 운영팀에 문의하세요.';renderLogin();return;}
  if(APP==='admin'&&p.role!=='admin'){await sb.auth.signOut();S.err='관리자 권한이 없는 계정입니다.';renderLogin();return;}
  if(APP==='member'&&p.role==='admin'){await sb.auth.signOut();S.err='관리자 계정은 관리자 사이트(/admin/)에서 로그인하세요.';renderLogin();return;}
  startSession(p);
}
async function doSignup(){
  const v=(id)=>($(id).value||'').trim();
  const fail=(m)=>{const e=$('su-err');e.textContent=m;e.hidden=false;$('su-btn').disabled=false;};
  const id=v('su-id').toLowerCase(),pw=$('su-pw').value,pw2=$('su-pw2').value,name=v('su-name'),co=S.su.coSel.trim();
  if(!/^[a-z0-9]{4,20}$/.test(id))return fail('아이디는 영문 소문자와 숫자 4~20자로 입력하세요.');
  if(pw.length<8)return fail('비밀번호는 8자 이상 입력하세요.');
  if(pw!==pw2)return fail('비밀번호 확인이 일치하지 않습니다.');
  if(!name)return fail('이름을 입력하세요.');
  if(!co)return fail('회사(소속)를 검색해 선택하거나 직접 입력하세요.');
  $('su-btn').disabled=true;
  const r=await sb.auth.signUp({email:idEmail(id),password:pw,options:{data:{login_id:id,name,company:co,company_source:PHARMA.includes(co)?'list':'custom',dept:v('su-dept'),contact_email:v('su-mail')}}});
  if(r.error){
    const m=r.error.message||'';
    return fail(/already|registered|exists/i.test(m)?'이미 사용 중인 아이디입니다.':/password/i.test(m)?'비밀번호가 보안 기준에 맞지 않습니다. 더 길게 입력하세요.':/rate|limit/i.test(m)?'가입 요청이 많습니다. 잠시 후 다시 시도하세요.':'가입하지 못했습니다: '+m);
  }
  if(!r.data.session)return fail('가입은 되었지만 이메일 확인 설정이 켜져 있어 로그인할 수 없습니다. Supabase에서 "Confirm email"을 꺼 주세요.');
  toast('가입이 완료되었습니다.');await enter(r.data.user);
}
function startSession(p){
  S.me=p;S.err='';S.view='app';S.tab='cal';S.sel=null;S.mode=null;S.apps={};S.locks=new Set();
  renderTop();renderApp();if(!isVendor())loadPrices();if(isAdmin())loadVendors().then(()=>{if(S.tab==='all')renderLedger();});refreshApps();loadNotis();subscribe();
}
async function logout(){
  if(S.chan){sb.removeChannel(S.chan);S.chan=null;}
  clearInterval(S.vpoll);
  await sb.auth.signOut();
  S.me=null;S.view='login';S.apps={};S.notis=[];S.err='';S.drawer=null;$('drawerHost').innerHTML='';renderTop();renderLogin();
}

/* ---------- calendar ---------- */
function renderApp(){
  if(S.tab==='cal'){
    $('main').innerHTML='<div class="toolbar"><div><h1>'+(APP==='admin'?'라이브세미나 · 웹심포지움 일정 관리':isVendor()?esc(S.me.company)+' 배정 세미나 일정':'라이브세미나 · 웹심포지움 일정 신청')+'</h1>'
    +'<p class="sub">'+(isVendor()?'외주사 계정은 세미나를 신청할 수 없으며, 배정된 세미나만 상세 내용이 표시됩니다. 다른 일정은 흐리게 가려집니다.':'점심 · 저녁 각 5개 슬롯 중 위 3개는 신청 가능, 아래 2개는 관리자 등록 슬롯입니다.'+(APP==='admin'?' 슬롯을 눌러 상태를 바꾸거나 직접 등록하세요.':' 타사 일정은 ‘세미나 확정’으로만 표시됩니다.'))+'</p></div>'
    +'<div class="monthnav"><button type="button" class="iconbtn" data-act="prevM" aria-label="이전 달"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>'
    +'<div class="m" id="mlabel"></div>'
    +'<button type="button" class="iconbtn" data-act="nextM" aria-label="다음 달"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg></button></div></div>'
    +'<div class="summary" id="summary"></div>'
    +'<div class="split"><section class="calbox" aria-label="세미나 달력"><div class="legend" id="legend"></div><div class="calscroll"><div class="grid" id="cal"></div></div></section>'
    +'<aside class="panel" id="panel" aria-live="polite"></aside></div>';
    renderLegend();renderSummary();renderCal();renderPanel();
  }else if(S.tab==='mine')renderMine();
  else if(S.tab==='all')renderLedgerShell();
  else if(S.tab==='members')renderMembersShell();
  else renderNoti();
}
function renderLegend(){
  const it=(k,ch,l)=>'<span><span class="pill p-'+k+'">'+ch+'</span>'+l+'</span>';
  $('legend').innerHTML='<b>범례</b>'+it('empty','+','빈자리')+it('req','신','신청')+it('rev','검','검토중')+it('ok','확','확정')+it('adj','조','조정')+(APP==='admin'?'':isVendor()?'<span><span class="pill p-oth">·</span><span class="blurtxt">■■ ■■■</span>배정되지 않은 일정(비공개)</span>':it('oth','·','세미나 확정(타사)'))+it('aempty','–','관리자 등록 슬롯')
   +'<span><span class="tag zoom">줌</span>줌 라이브세미나</span><span><span class="tag site">현장</span>현장 라이브세미나</span><span><span class="tag sympo">심포</span>웹심포지움</span><span><span class="tag na">비학술</span>비학술</span><span><span class="tag adm">관리자</span>관리자 등록</span>';
}
function renderSummary(){
  const el=$('summary');if(!el)return;
  const c={req:0,rev:0,ok:0,adj:0};Object.values(S.apps).forEach(a=>{if(c[a.status]!=null)c[a.status]++;});
  el.innerHTML=['req','rev','ok','adj'].map(k=>'<div class="sum"><span class="dot p-'+k+'">'+ST[k].ch+'</span><div><div class="l">'+(isAdmin()?'전체 ':isVendor()?'배정 ':'내 회사 ')+ST[k].label+'</div><div class="n">'+c[k]+'<span style="font-size:12px;font-weight:400;color:var(--ink-3)"> 건</span></div></div></div>').join('');
}
function weeksOf(y,m){
  const last=new Date(y,m+1,0).getDate();const weeks=[];let cur=null;
  for(let d=1;d<=last;d++){const dt=new Date(y,m,d);const w=dt.getDay();if(w===0||w===6)continue;
    if(!cur||w===1){cur=[null,null,null,null,null];weeks.push(cur);}cur[w-1]=dt;}
  return weeks;
}
function bar(ds,meal,n,past){
  const key=ds+'_'+meal+'_'+n;const a=S.apps[key];const aslot=n>=4;const taken=S.locks.has(key);
  let k,ch,text,tags='',na='',dis=false,title;
  if(a){
    k=a.status;ch=ST[a.status].ch;text=(isAdmin()||isVendor()?a.company+' · ':'')+a.title;
    if(aslot||a.adminRegistered)tags+='<span class="tag adm">관리자</span>';
    tags+=typeTag(a.type);if(a.acad==='비학술')na='<span class="tag na">비학술</span>';
    title=slotLabel(key)+' · '+ST[a.status].label+' · '+a.type+' · '+a.title;
  }else if(taken&&isVendor()){
    return '<button type="button" class="bar k-oth k-blur'+(n===4?' a4':'')+'" disabled title="배정되지 않은 일정" aria-label="'+esc(slotLabel(key))+' · 배정되지 않은 일정(비공개)"><span class="pill">·</span><span class="t blurtxt" aria-hidden="true">■■■■ ■■■ ■■■■■</span></button>';
  }else if(taken){k='oth';ch='·';text='세미나 확정';title=slotLabel(key)+' · 세미나 확정';}
  else if(aslot){k='aempty';ch='–';text='관리자 등록 슬롯';dis=!isAdmin()||past;title=slotLabel(key)+' · 관리자 등록 슬롯';}
  else if(past){k='past';ch='–';text='마감';dis=!isAdmin();title=slotLabel(key)+' · 지난 날짜';}
  else{k='empty';ch='+';text='빈자리';dis=isVendor();title=slotLabel(key)+(isVendor()?' · 빈자리':' · 빈자리, 신청 가능');}
  return '<button type="button" class="bar k-'+k+(n===4?' a4':'')+(S.sel===key?' sel':'')+'" data-key="'+key+'"'+(dis?' disabled':'')+' title="'+esc(title)+'" aria-label="'+esc(title)+'"><span class="pill">'+ch+'</span>'+tags+'<span class="t">'+esc(text)+'</span>'+na+'</button>';
}
function renderCal(){
  const el=$('cal');if(!el)return;
  $('mlabel').textContent=S.y+'년 '+(S.m+1)+'월';
  let h='<div class="dows">'+DOW.map(d=>'<div>'+d+'요일</div>').join('')+'</div>';
  weeksOf(S.y,S.m).forEach(w=>{
    h+='<div class="wk">';
    w.forEach(dt=>{
      if(!dt){h+='<div class="day off"></div>';return;}
      const ds=ymd(dt);const past=ds<todayStr;
      let free=0;['L','D'].forEach(m=>{for(let n=1;n<=3;n++){const k=ds+'_'+m+'_'+n;if(!S.apps[k]&&!S.locks.has(k)&&!past)free++;}});
      h+='<div class="day'+(past?' past':'')+'"><div class="dh"><span class="dn">'+dt.getDate()+'</span><span class="free">'+(past?'지난 날짜':(isVendor()?'':'신청 잔여 '+free+'/6'))+'</span></div>';
      ['L','D'].forEach(m=>{h+='<div class="meal"><span class="ml">'+(m==='L'?'점심':'저녁')+'</span>';for(let n=1;n<=5;n++)h+=bar(ds,m,n,past);h+='</div>';});
      h+='</div>';
    });
    h+='</div>';
  });
  el.innerHTML=h;
}
function blankForm(key){
  const meal=key.split('_')[1];
  const f={acad:'학술',type:meal==='D'?'웹심포지움':'줌 라이브세미나',mode:'생방송',company:isAdmin()?'':S.me.company,cat:'',leadItem:'',items:[''],title:'',topic:'',speakers:[{spk:'',aff:'',topic:''}],chair:{mode:'none',idx:-1,spk:'',aff:''},recruit:'',surveyOn:false,survey:'',pm:''};
  padSympo(f);return f;
}
function selectSlot(key){
  S.sel=key;S.err='';S.confirmCancel=false;S.editing=false;
  if(isVendor()&&!S.apps[key]){S.sel=null;S.mode=null;renderCal();renderPanel();return;}
  if(S.apps[key])S.mode='detail';
  else if(S.locks.has(key))S.mode='other';
  else{S.mode='form';S.form=blankForm(key);resetCatUI();}
  renderCal();renderPanel();
}
function priceHtml(){
  const f=S.form;const p=calcPrice(f);
  let h='<div class="top"><b>세미나 예상 금액</b><span class="basis">'+esc(p.basis)+'</span></div>';
  if(p.excluded)return h+'<span style="font-size:14px">'+esc(p.msg)+'</span><span class="fine">금액은 운영팀과 별도 협의합니다.</span>';
  h+=p.ok?'<div class="top"><span class="basis" style="font-size:13px">예상 금액</span><span class="amt">'+won(p.v)+'</span></div>':'<span style="font-size:14px">'+esc(p.msg)+'</span>';
  if(f.mode==='녹화'||f.mode==='녹화송출')h+='<span class="basis">녹화 · 녹화송출 단가는 확정 전이라 생방송 단가로 임시 계산했습니다.</span>';
  if(f.surveyOn)h+='<span class="basis">+ 심화설문('+esc(f.survey||'유형 미선택')+') 비용 [별도 견적]</span>';
  return h+'<span class="fine">모집 인원은 단가표의 다음 구간으로 올림 적용 · 최종 금액은 검토 후 확정</span>';
}
function opt(list,v){return list.map(x=>'<option'+(x===v?' selected':'')+'>'+esc(x)+'</option>').join('');}
function renderPanel(){
  const el=$('panel');if(!el)return;
  if(!S.sel){el.innerHTML='<div class="center"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg><strong>슬롯을 선택하세요</strong><span>'+(APP==='admin'?'슬롯을 누르면 상세 내용과 상태 변경이 열립니다. 빈 슬롯은 회사를 지정해 직접 등록할 수 있습니다.':isVendor()?'배정된 세미나를 누르면 상세 정보가 열립니다. 흐리게 표시된 일정은 배정되지 않은 일정으로 내용을 볼 수 없습니다.':'달력에서 점선으로 표시된 빈자리를 누르면 신청서가 열립니다. 내 신청 일정을 누르면 진행 상태를 볼 수 있습니다.')+'</span></div>';return;}
  let h='<div class="ph"><div class="eb">'+(S.mode==='form'?(S.editing?'신청 내용 수정':(isAdmin()?'일정 직접 등록':'새 신청')):'선택한 슬롯')+'</div><div class="tt">'+esc(slotLabel(S.sel))+'</div></div>';
  const isForm=S.mode==='form';
  if(isForm)h+=formHtml();
  else if(S.mode==='detail')h+=detailHtml();
  else h+='<div class="center"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg><strong>세미나 확정</strong><span>다른 소속의 일정입니다. 상세 내용은 공개되지 않습니다.</span></div>';
  el.innerHTML=h;
  if(isForm){renderCatPicker();if(!S.catsLoaded)loadCats();}
}
function chairOptLabel(s,i){return (i+1)+'번 연자 겸임'+(s.spk.trim()?' · '+s.spk.trim():'');}
function resetCatUI(){S.cat={q:'',kind:'질환',mode:'search'};}
async function loadCats(){
  S.catsLoaded=true;
  const r=await sb.from('categories').select('name,kind').limit(5000);
  if(!r.error){S.customCats=r.data;if($('catPicker'))renderCatPicker();}
}
function catMatches(q,kind){
  q=q.trim().toLowerCase().replace(/\s+/g,'');
  const all=CAT_PRESET[kind].map(n=>({n,src:kind})).concat((S.customCats||[]).filter(c=>c.kind===kind&&!CAT_PRESET[kind].includes(c.name)).map(c=>({n:c.name,src:'직접입력 등록'})));
  if(!q)return all.slice(0,12);
  return all.filter(o=>o.n.toLowerCase().replace(/\s+/g,'').includes(q)).slice(0,12);
}
function renderCatResults(){
  const el=$('catResults');if(!el)return;const c=S.cat;
  const r=catMatches(c.q,c.kind);
  el.innerHTML=(r.length?r.map(o=>'<button type="button" data-cat="'+esc(o.n)+'"><span>'+esc(o.n)+'</span><span class="src">'+esc(o.src)+'</span></button>').join(''):'<div class="none">검색 결과가 없습니다.</div>')
   +'<button type="button" data-act="catCustom"><span>찾는 '+(c.kind==='질환'?'질환':'진료과')+'이 없나요? <b>직접 입력</b></span><span class="src">'+esc(c.q.trim())+'</span></button>';
}
function renderCatPicker(){
  const el=$('catPicker');if(!el||!S.form)return;if(!S.cat)resetCatUI();const c=S.cat,f=S.form;
  const ck=f.cat?(catKind(f.cat)||f.catNewKind||''):'';
  if(f.cat){el.innerHTML='<div class="cochip"><span>'+(ck?'<span class="catkind">'+esc(ck)+'</span> ':'')+'<b>'+esc(f.cat)+'</b></span><button type="button" class="btn sm" data-act="catChange">변경</button></div>';return;}
  const pills='<div class="pills" role="group" aria-label="카테고리 기준">'+CAT_KINDS.map(k=>'<button type="button" data-catkind="'+k+'" aria-pressed="'+(c.kind===k)+'">'+(k==='질환'?'질환별':'진료과')+'</button>').join('')+'</div>';
  if(c.mode==='custom'){
    el.innerHTML=pills+'<input id="cat-custom" aria-label="카테고리 직접 입력" placeholder="'+(c.kind==='질환'?'질환명':'진료과명')+'을 입력하세요" value="'+esc(c.q)+'" class="pickin">'
     +'<div style="display:flex;gap:8px"><button type="button" class="btn primary sm" data-act="catCustomOk">이 이름으로 사용</button><button type="button" class="btn sm" data-act="catSearch">목록에서 검색</button></div>'
     +'<span style="font-size:12px;color:var(--ink-3)">직접 입력한 카테고리는 저장 후 다른 신청자의 검색 목록에도 추가됩니다.</span>';
    return;
  }
  el.innerHTML=pills+'<input id="cat-q" type="search" aria-label="카테고리 검색" placeholder="'+(c.kind==='질환'?'질환명 검색 (예: 고혈압, 당뇨)':'진료과 검색 (예: 내과, 정형외과)')+'" value="'+esc(c.q)+'" autocomplete="off" class="pickin"><div class="coresults" id="catResults"></div>';
  renderCatResults();
}
async function saveCustomCat(name,kind){
  if(!name||catKind(name))return;
  (S.customCats=S.customCats||[]).push({name,kind});
  await sb.from('categories').insert({name,kind,added_by:S.me.id});
}
function formHtml(){
  const f=S.form;const n=Number(S.sel.split('_')[2]);
  let h='<form class="pb" id="appForm" novalidate>';
  h+='<div class="acadbox"><span class="lbl">학술 구분 <span class="req-mark">*</span></span><div class="pills">'+['학술','비학술'].map(x=>'<button type="button" data-pick="acad:'+x+'" aria-pressed="'+(f.acad===x)+'">'+x+'</button>').join('')+'</div>'
   +(f.acad==='비학술'?'<span style="font-size:12px;color:var(--ink-2)">비학술 행사는 예상 금액이 산정되지 않습니다.</span>':'')+'</div>';
  if(n>=4)h+='<div class="note info">관리자 등록 슬롯입니다. 신청 회사를 지정해 등록하세요.</div>';
  h+='<div class="row2"><div class="fld"><label for="f-type">유형</label><select id="f-type" data-f="type">'+opt(TYPES,f.type)+'</select></div>'
   +'<div class="fld"><label for="f-mode">송출형태</label><select id="f-mode" data-f="mode">'+opt(MODES,f.mode)+'</select></div></div>';
  h+='<div class="row2"><div class="fld"><label for="f-co">회사</label><input id="f-co" data-f="company" value="'+esc(f.company)+'"'+(isAdmin()&&!S.editing?' placeholder="신청 회사명" list="co-list"':' readonly')+'>'+(isAdmin()?'<datalist id="co-list">'+PHARMA.concat(S.customCos).map(c=>'<option value="'+esc(c)+'"></option>').join('')+'</datalist>':'')+'</div>'
   +'<div class="fld"><label for="f-lead">리드 품목</label><input id="f-lead" data-f="leadItem" placeholder="대표 품목" value="'+esc(f.leadItem)+'"></div></div>';
  h+='<div class="box"><span class="lbl">카테고리 <span style="font-weight:400;color:var(--ink-3)">· 질환별 또는 진료과</span></span><div id="catPicker" class="copicker"></div></div>';
  h+='<div class="box"><span class="lbl">품목</span>';
  f.items.forEach((it,i)=>{
    h+='<div class="sprow"><span class="no">'+(i+1)+'</span><div class="fld" style="flex:1 1 0"><label for="it-'+i+'" class="sr">품목 '+(i+1)+'</label><input id="it-'+i+'" data-it="'+i+'" placeholder="제품명 / 성분명" value="'+esc(it)+'"></div>'
     +(i>0?'<button type="button" class="iconbtn sp" style="width:40px;height:40px" data-act="rmItem" data-i="'+i+'" aria-label="'+(i+1)+'번 품목 삭제"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>':'<span class="sp"></span>')+'</div>';
  });
  if(f.items.length<MAX_ITEMS)h+='<button type="button" class="btn dashed" data-act="addItem">+ 품목 추가</button>';
  h+='</div>';
  h+='<div class="fld"><label for="f-title">행사명 <span class="req-mark">*</span></label><input id="f-title" data-f="title" placeholder="행사명을 입력하세요" value="'+esc(f.title)+'"></div>';
  h+='<div class="fld"><label for="f-topic">연제</label><input id="f-topic" data-f="topic" placeholder="강의 제목" value="'+esc(f.topic)+'"></div>';
  const sym=isSympo(f),minSp=sym?2:1;
  h+='<div class="box"><span class="lbl">'+(sym?'연자 · 소속 · 주제 <span style="font-weight:400;color:var(--ink-3)">· 웹심포지움은 연자 2명 기본</span>':'연자 · 소속')+'</span>';
  f.speakers.forEach((s,i)=>{
    h+='<div class="spgrp"><div class="sprow"><span class="no">'+(i+1)+'</span>'
     +'<div class="fld"><label for="sp-'+i+'">연자'+(sym&&f.chair.mode==='spk'&&f.chair.idx===i?' <span class="chairtag">좌장 겸임</span>':'')+'</label><input id="sp-'+i+'" data-sp="'+i+'" data-spf="spk" placeholder="성명" value="'+esc(s.spk)+'"></div>'
     +'<div class="fld"><label for="sa-'+i+'">소속</label><input id="sa-'+i+'" data-sp="'+i+'" data-spf="aff" placeholder="병원 · 진료과" value="'+esc(s.aff)+'"></div>'
     +(i>=minSp?'<button type="button" class="iconbtn sp" style="width:40px;height:40px" data-act="rmSpk" data-i="'+i+'" aria-label="'+(i+1)+'번 연자 삭제"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>':'<span class="sp"></span>')
     +'</div>';
    if(sym)h+='<div class="sprow sptopic"><span class="no"></span><div class="fld" style="flex:1 1 0"><label for="st-'+i+'">'+(i+1)+'번 연자 주제</label><input id="st-'+i+'" data-sp="'+i+'" data-spf="topic" placeholder="발표 주제" value="'+esc(s.topic||'')+'"></div><span class="sp"></span></div>';
    h+='</div>';
  });
  if(f.speakers.length<MAX_SPK)h+='<button type="button" class="btn dashed" data-act="addSpk">+ 연자 추가</button>';
  h+='</div>';
  if(sym){
    h+='<div class="box"><span class="lbl">좌장</span><div class="fld"><label for="f-chair" class="sr">좌장 선택</label><select id="f-chair">'
     +'<option value="none"'+(f.chair.mode==='none'?' selected':'')+'>좌장 없음</option>'
     +f.speakers.map((s,i)=>'<option value="s'+i+'"'+(f.chair.mode==='spk'&&f.chair.idx===i?' selected':'')+'>'+esc(chairOptLabel(s,i))+'</option>').join('')
     +'<option value="sep"'+(f.chair.mode==='sep'?' selected':'')+'>별도 좌장 지정 (연자 외)</option></select></div>';
    if(f.chair.mode==='sep')h+='<div class="sprow"><span class="no">좌</span><div class="fld"><label for="ch-spk">좌장</label><input id="ch-spk" data-ch="spk" placeholder="성명" value="'+esc(f.chair.spk)+'"></div><div class="fld"><label for="ch-aff">소속</label><input id="ch-aff" data-ch="aff" placeholder="병원 · 진료과" value="'+esc(f.chair.aff)+'"></div><span class="sp"></span></div>';
    h+='</div>';
  }
  h+='<div class="row2"><div class="fld"><label for="f-rec">모집 인원 수</label><input id="f-rec" data-f="recruit" type="number" inputmode="numeric" min="0" step="100" placeholder="예) 3000" value="'+esc(f.recruit)+'"></div>'
   +'<div class="fld"><label for="f-pm">담당PM</label><input id="f-pm" data-f="pm" placeholder="이름 / 연락처" value="'+esc(f.pm)+'"></div></div>';
  h+='<div class="box" style="background:var(--surface)"><label class="chk"><input type="checkbox" id="f-survey"'+(f.surveyOn?' checked':'')+'>심화설문 신청</label>';
  if(f.surveyOn)h+='<span style="font-size:12px;color:var(--ink-2)">설문 유형을 하나 선택하세요 <span class="req-mark">*</span></span><div class="pills">'+SURVEYS.map(x=>'<button type="button" data-pick="survey:'+x+'" aria-pressed="'+(f.survey===x)+'">'+x+'</button>').join('')+'</div>';
  h+='</div>';
  h+='<div class="price" id="price">'+priceHtml()+'</div>';
  if(S.err)h+='<div class="err" role="alert">'+esc(S.err)+'</div>';
  h+='<button type="submit" class="btn primary" id="f-submit"'+(S.busy?' disabled':'')+'>'+(S.editing?'수정 내용 저장':(isAdmin()?'이 슬롯에 등록하기':'이 슬롯으로 신청하기'))+'</button>';
  if(S.editing)h+='<button type="button" class="btn" data-act="cancelEdit">수정 취소</button>';
  if(!isAdmin())h+='<p style="margin:0;font-size:12px;color:var(--ink-3)">신청 후 닥터빌 운영팀 검토를 거쳐 확정됩니다. 진행 상황이 바뀌면 알림으로 안내드립니다.</p>';
  return h+'</form>';
}
function detailHtml(){
  if(isVendor())return vendorDetailHtml();
  const a=S.apps[S.sel];const st=ST[a.status];
  const p=a.acad==='비학술'?'산정 제외':(a.priceList!=null?won(a.priceList):'별도 협의');
  const cur=STATUS_ORDER.indexOf(a.status);
  let h='<div class="pb"><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><span class="stbadge p-'+a.status+'">'+st.label+'</span><span style="color:var(--ink-2);font-size:13px">'+esc(a.acad)+' · '+esc(a.type)+' · '+esc(a.mode)+'</span>'+(a.adminRegistered?'<span class="tag adm">관리자 등록</span>':'')+'</div>';
  h+='<div class="steps">'+STATUS_ORDER.map((k,i)=>{let on=i<=cur;if(a.status==='ok'&&k==='adj')on=false;return '<div class="s'+(i===cur?' cur':'')+'"><span class="c'+(on?' p-'+k:'')+'"'+(on?' style="border-color:transparent"':'')+'>'+(i+1)+'</span>'+ST[k].label+'</div>';}).join('')+'</div>';
  if(a.adjustNote)h+='<div class="note adj">'+esc(a.adjustNote)+'</div>';
  const sp=speakersText(a,'\n')||'-';
  const rows=[['학술 구분',a.acad],['회사',a.company],['신청자',a.applicant||'-'],['카테고리',catLabel(a.cat)||'-'],['리드 품목',a.leadItem||'-'],['품목',a.item||'-'],['행사명',a.title],['연제',a.topic||'-'],[isSympo(a)?'좌장 · 연자 · 주제':'연자 · 소속',sp],['모집 인원',a.recruit?fmtN(a.recruit)+'명':'-'],['심화설문',a.surveyOn?'신청 · '+a.survey:'미신청'],['담당PM',a.pm||'-']];
  if(isAdmin())rows.push(['배정 외주사',vendorName(a.vendorId)||'미배정']);
  h+='<dl class="kv">'+rows.map(r=>'<div><dt>'+r[0]+'</dt><dd>'+esc(r[1])+'</dd></div>').join('')+'</dl>';
  h+='<div class="note info" style="display:flex;justify-content:space-between;align-items:baseline;gap:8px"><span>예상 금액</span><b style="font-size:18px;font-variant-numeric:tabular-nums">'+p+'</b></div>';
  const mineOwn=!isAdmin()&&!a.adminRegistered&&(a.status==='req'||a.status==='adj');
  if(mineOwn||isAdmin()){
    if(S.confirmCancel)h+='<div class="note adj">'+(isAdmin()?'이 일정을 삭제할까요? 신청자에게 알림이 갑니다.':'이 신청을 취소할까요? 슬롯이 다시 빈자리가 됩니다.')+'</div><div style="display:flex;gap:8px"><button type="button" class="btn danger" style="flex:1" data-act="doCancel">'+(isAdmin()?'삭제 확정':'신청 취소 확정')+'</button><button type="button" class="btn" style="flex:1" data-act="noCancel">돌아가기</button></div>';
    else h+='<div style="display:flex;gap:8px"><button type="button" class="btn" style="flex:1" data-act="edit">내용 수정</button><button type="button" class="btn danger" style="flex:1" data-act="askCancel">'+(isAdmin()?'일정 삭제':'신청 취소')+'</button></div>';
  }else if(a.adminRegistered)h+='<div class="note info">닥터빌 관리자가 등록한 일정입니다. 변경은 담당 운영자에게 문의해 주세요.</div>';
  else if(!isAdmin())h+='<div class="note info">검토 중이거나 확정된 신청은 운영팀에 문의해 변경해 주세요.</div>';
  if(isAdmin()){
    h+='<div class="adminbox"><span class="lbl">진행 상태 변경</span>'
     +'<div class="fld"><label for="adm-st">상태</label><select id="adm-st">'+STATUS_ORDER.map(k=>'<option value="'+k+'"'+(k===a.status?' selected':'')+'>'+ST[k].label+'</option>').join('')+'</select></div>'
     +'<div class="fld"><label for="adm-note">조정 · 안내 메모</label><textarea id="adm-note" placeholder="조정 사유나 안내 내용 (신청자 화면에 표시)">'+esc(a.adjustNote||'')+'</textarea></div>'
     +'<span style="font-size:12px;color:var(--ink-3)">상태가 바뀌면 신청자에게 자동으로 알림이 갑니다.</span>'
     +'<div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="btn" data-act="admSave" style="flex:1">상태 저장</button><button type="button" class="btn" data-rec="'+S.sel+'" style="flex:1">협의 내용 기록</button></div></div>';
  }
  return h+'</div>';
}
async function submitForm(){
  const f=S.form;const key=S.sel;
  if(!f.title.trim()){S.err='행사명을 입력해 주세요.';renderPanel();$('f-title')&&$('f-title').focus();return;}
  if(isAdmin()&&!f.company.trim()){S.err='신청 회사를 입력해 주세요.';renderPanel();return;}
  if(f.surveyOn&&!f.survey){S.err='심화설문 유형(인식형 · 리뷰형 · 분석형 · 적용형)을 선택해 주세요.';renderPanel();return;}
  if(!S.editing&&S.locks.has(key)){S.err='방금 다른 신청이 접수된 슬롯입니다. 다른 빈자리를 선택하세요.';renderPanel();return;}
  S.busy=true;S.err='';renderPanel();
  const row=toRow(f,key);let r;
  if(S.editing){
    const old=S.apps[key];
    if(isAdmin())row.company=f.company.trim();
    r=await sb.from('applications').update(row).eq('id',old.id).select().single();
  }else{
    if(isAdmin()){row.company=f.company.trim();row.user_id=S.me.id;row.status='ok';row.applicant=S.me.name;}
    else{row.company=S.me.company;row.user_id=S.me.id;}
    row.slot_key=key;
    r=await sb.from('applications').insert(row).select().single();
  }
  S.busy=false;
  if(r.error){S.err=errMsg(r.error,'저장하지 못했습니다. 잠시 후 다시 시도하세요.');renderPanel();return;}
  if(f.cat&&f.catNewKind)saveCustomCat(f.cat,f.catNewKind);
  const was=S.editing;S.editing=false;S.mode='detail';
  S.apps[key]=Object.assign(fromRow(r.data),{adm:(S.apps[key]&&S.apps[key].adm)||fromRow(r.data).adm});S.locks.add(key);
  toast(was?'수정 내용을 저장했습니다.':(isAdmin()?'일정을 등록했습니다.':'신청이 접수되었습니다.'));
  renderCal();renderPanel();renderSummary();
}
async function adminSave(){
  const a=S.apps[S.sel];const st=$('adm-st').value;const note=$('adm-note').value.trim();
  const r=await sb.from('applications').update({status:st,adjust_note:note}).eq('id',a.id);
  if(r.error){toast(errMsg(r.error,'저장하지 못했습니다. 다시 시도하세요.'));return;}
  toast(st!==a.status?'상태를 저장했습니다. 신청자에게 알림이 갑니다.':'저장했습니다.');scheduleRefresh();
}
async function doCancel(){
  const a=S.apps[S.sel];const key=S.sel;
  const r=await sb.from('applications').delete().eq('id',a.id);
  if(r.error){toast(errMsg(r.error,'취소하지 못했습니다. 다시 시도하세요.'));return;}
  delete S.apps[key];S.locks.delete(key);S.sel=null;S.mode=null;S.confirmCancel=false;renderCal();renderPanel();renderSummary();toast(isAdmin()?'삭제했습니다.':'신청을 취소했습니다.');
}
function vendorDetailHtml(){
  const a=S.apps[S.sel];const st=ST[a.status];
  let h='<div class="pb"><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><span class="stbadge p-'+a.status+'">'+st.label+'</span><span style="color:var(--ink-2);font-size:13px">'+esc(a.acad)+' · '+esc(a.type)+' · '+esc(a.mode)+'</span></div>';
  if(a.adjustNote)h+='<div class="note adj">'+esc(a.adjustNote)+'</div>';
  const sp=speakersText(a,'\n')||'-';
  const rows=[['회사',a.company],['행사명',a.title],['연제',a.topic||'-'],[isSympo(a)?'좌장 · 연자 · 주제':'연자 · 소속',sp],['카테고리',catLabel(a.cat)||'-'],['리드 품목',a.leadItem||'-'],['품목',a.item||'-'],['모집 인원',a.recruit?fmtN(a.recruit)+'명':'-'],['심화설문',a.surveyOn?'신청 · '+a.survey:'미신청'],['신청 PM',a.pm||'-'],
    ['시간',a.adm.time||'-'],['CID',a.adm.cid||'-'],['채널',a.adm.channel||'-'],['담당자',a.adm.manager||'-'],['PM(내부)',a.adm.pmInternal||'-'],['설문 배포',a.adm.surveyDist||'-'],['다시보기',a.adm.replay||'-']];
  h+='<dl class="kv">'+rows.map(r=>'<div><dt>'+r[0]+'</dt><dd>'+esc(r[1])+'</dd></div>').join('')+'</dl>';
  h+='<div class="note info">외주사 계정은 조회만 가능합니다. 변경이 필요하면 닥터빌 운영팀에 요청하세요.</div>';
  return h+'</div>';
}
function renderMine(){
  if(isVendor())return renderVendorList();
  const rows=Object.entries(S.apps).sort((x,y)=>sortKey(x[0])<sortKey(y[0])?-1:1);
  let h='<div class="toolbar"><div><h1>내 신청 현황</h1><p class="sub">'+esc(S.me.company)+' 소속으로 신청된 일정입니다.</p></div></div>';
  if(!rows.length)h+='<div class="listbox"><div class="empty">아직 신청한 일정이 없습니다. ‘일정 신청’ 탭에서 빈자리를 선택해 신청하세요.</div></div>';
  else{
    h+='<div class="listbox"><table class="list"><thead><tr><th>일정</th><th>구분</th><th>유형</th><th>행사명</th><th>모집 인원</th><th>예상 금액</th><th>상태</th><th></th></tr></thead><tbody>';
    rows.forEach(([k,a])=>{
      h+='<tr><td style="white-space:nowrap">'+esc(slotLabel(k))+'</td><td>'+esc(a.acad)+'</td><td style="white-space:nowrap">'+esc(a.type)+'</td><td>'+esc(a.title)+'</td><td class="num">'+(a.recruit?fmtN(a.recruit)+'명':'-')+'</td><td class="num">'+(a.acad==='비학술'?'산정 제외':(a.priceList!=null?won(a.priceList):'별도 협의'))+'</td><td><span class="stbadge p-'+a.status+'" style="font-size:12px">'+ST[a.status].label+'</span></td><td><button type="button" class="btn sm" data-goto="'+k+'">보기</button></td></tr>';
    });
    h+='</tbody></table></div>';
  }
  $('main').innerHTML=h;
}

function renderVendorList(){
  const rows=Object.entries(S.apps).sort((x,y)=>sortKey(x[0])<sortKey(y[0])?-1:1);
  let h='<div class="toolbar"><div><h1>배정 목록</h1><p class="sub">'+esc(S.me.company)+'에 배정된 세미나입니다.</p></div></div>';
  if(!rows.length)h+='<div class="listbox"><div class="empty">아직 배정된 세미나가 없습니다. 배정되면 알림으로 안내드립니다.</div></div>';
  else{
    h+='<div class="listbox"><table class="list"><thead><tr><th>일정</th><th>시간</th><th>회사</th><th>유형</th><th>송출형태</th><th>행사명</th><th>연자</th><th>CID</th><th>채널</th><th>상태</th><th></th></tr></thead><tbody>';
    rows.forEach(([k,a])=>{
      h+='<tr><td style="white-space:nowrap">'+esc(slotLabel(k))+'</td><td>'+esc(a.adm.time||'-')+'</td><td>'+esc(a.company)+'</td><td style="white-space:nowrap">'+esc(a.type)+'</td><td>'+esc(a.mode)+'</td><td>'+esc(a.title)+'</td><td>'+esc(speakersText(a,', ')||'-')+'</td><td>'+esc(a.adm.cid||'-')+'</td><td>'+esc(a.adm.channel||'-')+'</td><td><span class="stbadge p-'+a.status+'" style="font-size:12px">'+ST[a.status].label+'</span></td><td><button type="button" class="btn sm" data-goto="'+k+'">보기</button></td></tr>';
    });
    h+='</tbody></table></div>';
  }
  $('main').innerHTML=h;
}

/* ---------- admin ledger ---------- */
const MONEY=new Set(['기본 금액','심화설문 지급','심화설문 청구','최종 금액']);
const NUMS=new Set(['모집 인원','신청자 수','참석자 수','설문 참여자 수']);
const WRAP=new Set(['행사명','연제','강사명(소속)']);
const COLS=[
 ['no.',(a,k,i)=>i+1],['상태',a=>ST[a.status].label],['일시',a=>a.date],['시간',a=>a.adm.time||((a.meal==='L'?'점심':'저녁')+' '+a.slot+'번')],
 ['CID',a=>a.adm.cid],['설문 배포',a=>a.adm.surveyDist],['유형',a=>a.type],['송출형태',a=>a.mode],['업체',a=>vendorName(a.vendorId)||a.adm.vendor],['채널',a=>a.adm.channel],['담당자',a=>a.adm.manager],
 ['구분',a=>a.acad],['회사',a=>a.company],['카테고리',a=>catLabel(a.cat)],['리드 품목',a=>a.leadItem],['품목',a=>a.item],['PM(내부)',a=>a.adm.pmInternal],
 ['행사명',a=>a.title],['연제',a=>a.topic],['강사명(소속)',a=>speakersText(a,'; ')],['PM',a=>a.pm],['설문 유형',a=>a.surveyOn?a.survey:'미신청'],
 ['모집 인원',a=>nOrBlank(a.recruit)],['신청자 수',a=>nOrBlank(a.adm.applicants)],['참석자 수',a=>nOrBlank(a.adm.attendees)],['설문 참여자 수',a=>nOrBlank(a.adm.surveyParticipants)],
 ['개인정보동의',a=>a.adm.privacy],['질문',a=>a.adm.questions],['다시보기',a=>a.adm.replay],
 ['기본 금액',a=>basePrice(a)],['심화설문 지급',a=>nOrBlank(a.adm.surveyPay)],['심화설문 청구',a=>nOrBlank(a.adm.surveyBill)],['최종 금액',a=>finalPrice(a)]
];
function ledgerRows(){
  const al=S.al;let from='',to='';
  if(al.scope==='month'){from=al.y+'-'+pad(al.m+1)+'-01';to=al.y+'-'+pad(al.m+1)+'-31';}
  else if(al.scope==='range'){from=al.from;to=al.to;}
  const q=al.q.trim().toLowerCase();
  return Object.entries(S.apps).filter(([k,a])=>{
    if(from&&a.date<from)return false;if(to&&a.date>to)return false;
    if(al.st!=='all'&&a.status!==al.st)return false;
    if(q){const hay=[a.leadItem,a.item,a.company,a.title,a.topic].join(' ').toLowerCase();if(!hay.includes(q))return false;}
    return true;
  }).sort((x,y)=>sortKey(x[0])<sortKey(y[0])?-1:1);
}
function periodLabel(){const al=S.al;if(al.scope==='all')return'전체 기간';if(al.scope==='month')return al.y+'년 '+(al.m+1)+'월';return (al.from||'처음')+' ~ '+(al.to||'끝');}
function renderLedgerShell(){
  const al=S.al;
  let h='<div class="toolbar"><div><h1>전체 신청 현황</h1><p class="sub">행의 ‘기록’을 눌러 신청 PM과 협의한 내용을 추가로 기록하세요.</p></div>'
   +'<div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="btn" data-act="expXlsx">Excel 내려받기</button><button type="button" class="btn" data-act="expPdf">PDF 내려받기</button></div></div>';
  h+='<div class="filters"><div class="fld"><span class="lbl">보기</span><div class="seg" role="group" aria-label="기간 보기">'+[['all','전체'],['month','월별'],['range','기간 지정']].map(([v,l])=>'<button type="button" data-scope="'+v+'" aria-pressed="'+(al.scope===v)+'">'+l+'</button>').join('')+'</div></div>';
  if(al.scope==='month')h+='<div class="fld"><span class="lbl">월</span><div class="monthnav"><button type="button" class="iconbtn" data-act="alPrev" aria-label="이전 달" style="width:40px;height:40px"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button><span class="m" style="font-size:16px;min-width:100px">'+al.y+'년 '+(al.m+1)+'월</span><button type="button" class="iconbtn" data-act="alNext" aria-label="다음 달" style="width:40px;height:40px"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg></button></div></div>';
  if(al.scope==='range')h+='<div class="fld"><label for="al-from">시작일</label><input type="date" id="al-from" value="'+esc(al.from)+'"></div><div class="fld"><label for="al-to">종료일</label><input type="date" id="al-to" value="'+esc(al.to)+'"></div>';
  h+='<div class="fld"><label for="al-st">상태</label><select id="al-st"><option value="all">전체 상태</option>'+STATUS_ORDER.map(k=>'<option value="'+k+'"'+(al.st===k?' selected':'')+'>'+ST[k].label+'</option>').join('')+'</select></div>'
   +'<div class="fld grow"><label for="al-q">검색</label><input type="search" id="al-q" placeholder="리드 품목 · 품목 · 회사 · 행사명 · 연제" value="'+esc(al.q)+'"></div></div><div id="ledger"></div>';
  $('main').innerHTML=h;renderLedger();
}
function renderLedger(){
  const el=$('ledger');if(!el)return;
  const rows=ledgerRows();
  let sumFinal=0;rows.forEach(([k,a])=>{const f=finalPrice(a);if(typeof f==='number')sumFinal+=f;});
  let h='<div class="ledgerhead"><span>'+esc(periodLabel())+' · <b>'+rows.length+'</b>건</span><span>최종 금액 합계 <b>'+won(sumFinal)+'</b></span></div>';
  if(!rows.length){el.innerHTML=h+'<div class="listbox"><div class="empty">조건에 맞는 신청이 없습니다. 기간이나 검색어를 바꿔 보세요.</div></div>';return;}
  h+='<div class="ledger"><table class="full"><thead><tr><th class="first">기록</th>'+COLS.map(c=>'<th>'+c[0]+'</th>').join('')+'</tr></thead><tbody>';
  rows.forEach(([k,a],i)=>{
    h+='<tr><td class="first"><button type="button" class="btn sm" data-rec="'+k+'">기록</button></td>';
    COLS.forEach(([lab,fn])=>{
      const v=fn(a,k,i);
      if(lab==='상태'){h+='<td><span class="stbadge p-'+a.status+'" style="font-size:11px">'+v+'</span></td>';return;}
      const isNum=MONEY.has(lab)||NUMS.has(lab);
      const disp=v===''?'-':(isNum&&typeof v==='number'?fmtN(v):v);
      const auto=lab==='최종 금액'&&a.adm.finalPrice===''&&typeof v==='number';
      h+='<td class="'+(isNum?'num':'')+(WRAP.has(lab)?' wrapcell':'')+(v===''||auto?' muted':'')+'"'+(auto?' title="기본 금액 + 심화설문 청구 자동 계산"':'')+'>'+esc(disp)+'</td>';
    });
    h+='</tr>';
  });
  h+='</tbody></table></div><p style="font-size:12px;color:var(--ink-3);margin:8px 0 0">회색 금액은 기본 금액 + 심화설문 청구로 자동 계산된 값입니다. ‘기록’에서 최종 금액을 직접 입력하면 그 값이 우선합니다.</p>';
  el.innerHTML=h;
}
const ADMF=[
 ['운영 정보',[['time','시간','예) 12:30~13:30'],['cid','CID',''],['surveyDist','설문 배포','예) 배포 / 미배포'],['vendor','업체',''],['channel','채널',''],['manager','담당자',''],['pmInternal','PM(내부)','']]],
 ['행사 결과',[['applicants','신청자 수',''],['attendees','참석자 수',''],['surveyParticipants','설문 참여자 수',''],['privacy','개인정보동의','예) 동의 1,240명'],['questions','질문','예) 12건'],['replay','다시보기','예) 제공 / 미제공 / URL']]],
 ['정산',[['basePrice','기본 금액',''],['surveyPay','심화설문 지급',''],['surveyBill','심화설문 청구',''],['finalPrice','최종 금액','']]]
];
function openRecord(key){
  const a=S.apps[key];if(!a)return;S.drawer=key;
  const autoBase=a.acad==='비학술'?'산정 제외':(a.priceList!=null?fmtN(a.priceList):'');
  let h='<div class="scrim" id="scrim"><div class="drawer" role="dialog" aria-modal="true" aria-labelledby="dr-t">'
   +'<div class="dh2"><div><div style="font-size:12px;color:var(--accent);font-weight:500">'+esc(slotLabel(key))+'</div><div id="dr-t" style="font-size:17px;font-weight:700">'+esc(a.title)+'</div><div style="font-size:13px;color:var(--ink-2)">'+esc(a.company)+' · '+esc(a.acad)+' · '+esc(a.type)+' · '+esc(a.mode)+' · 신청 PM '+esc(a.pm||'-')+'</div></div><button type="button" class="iconbtn" data-act="closeRec" aria-label="닫기"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>';
  h+='<div class="sec"><h2>진행 상태</h2><div class="row2"><div class="fld"><label for="rc-st">상태</label><select id="rc-st">'+STATUS_ORDER.map(k=>'<option value="'+k+'"'+(k===a.status?' selected':'')+'>'+ST[k].label+'</option>').join('')+'</select></div>'
   +'<div class="fld"><label for="rc-lead">리드 품목</label><input id="rc-lead" value="'+esc(a.leadItem)+'"></div></div>'
   +'<div class="fld"><label for="rc-note">조정 · 안내 메모 (신청자에게 표시)</label><textarea id="rc-note">'+esc(a.adjustNote||'')+'</textarea></div>'
   +'<span style="font-size:12px;color:var(--ink-3)">상태가 바뀌면 신청자에게, 외주사를 배정하면 해당 외주사 계정에 자동으로 알림이 갑니다.</span></div>';
  ADMF.forEach(([sec,fs])=>{
    h+='<div class="sec"><h2>'+sec+'</h2><div class="row2">';
    fs.forEach(([id,l,ph])=>{
      let p=ph;if(id==='basePrice')p='비우면 자동: '+(autoBase||'없음');if(id==='finalPrice')p='비우면 기본 금액 + 심화설문 청구';
      if(id==='vendor'){h+='<div class="fld"><label for="rc-vendor">업체 (배정 외주사)</label><select id="rc-vendor"><option value="">미배정</option>'+S.vendors.map(v=>'<option value="'+v.id+'"'+(v.id===a.vendorId?' selected':'')+'>'+esc(v.name)+'</option>').join('')+'</select></div>';return;}
      h+='<div class="fld"><label for="rc-'+id+'">'+l+'</label><input id="rc-'+id+'"'+(ADMNUM.has(id)?' type="number" inputmode="numeric"':'')+' placeholder="'+esc(p)+'" value="'+esc(a.adm[id])+'"></div>';
    });
    h+='</div></div>';
  });
  h+='<div class="sec"><h2>신청 내용</h2><dl class="kv">'+[['카테고리',catLabel(a.cat)||'-'],['품목',a.item||'-'],['연제',a.topic||'-'],['강사명(소속)',speakersText(a,'\n')||'-'],['모집 인원',a.recruit?fmtN(a.recruit)+'명':'-'],['설문 유형',a.surveyOn?a.survey:'미신청'],['신청자',a.applicant||'-']].map(r=>'<div><dt>'+r[0]+'</dt><dd>'+esc(r[1])+'</dd></div>').join('')+'</dl></div>';
  h+='<div class="foot"><button type="button" class="btn primary" style="flex:1" data-act="saveRec">기록 저장</button><button type="button" class="btn" data-act="closeRec">닫기</button></div></div></div>';
  $('drawerHost').innerHTML=h;$('rc-st').focus();
}
function closeRecord(){S.drawer=null;S.memDrawer=null;$('drawerHost').innerHTML='';if(S.tab==='all')renderLedger();if(S.tab==='members')renderMembers();}
async function saveRecord(){
  const key=S.drawer;const a=S.apps[key];if(!a)return;
  const adm={application_id:a.id};
  const vid=$('rc-vendor').value===''?null:Number($('rc-vendor').value);
  ADMF.forEach(([s,fs])=>fs.forEach(([id])=>{if(id==='vendor'){adm.vendor=vid?vendorName(vid):'';return;}const v=$('rc-'+id).value.trim();adm[ADMMAP[id]]=ADMNUM.has(id)?(v===''?null:Number(v)):v;}));
  const st=$('rc-st').value,note=$('rc-note').value.trim(),lead=$('rc-lead').value.trim();
  const r1=await sb.from('application_admin').upsert(adm);
  if(r1.error){toast(errMsg(r1.error,'기록을 저장하지 못했습니다.'));return;}
  if(st!==a.status||note!==a.adjustNote||lead!==a.leadItem||vid!==a.vendorId){
    const r2=await sb.from('applications').update({status:st,adjust_note:note,lead_item:lead,vendor_id:vid}).eq('id',a.id);
    if(r2.error){toast(errMsg(r2.error,'상태를 저장하지 못했습니다.'));return;}
  }
  toast('기록을 저장했습니다.');closeRecord();scheduleRefresh();
}

/* ---------- admin: 회원 관리 ---------- */
const ROLE_LABEL={member:'회원',admin:'관리자',vendor:'외주사'};
const MST_LABEL={active:'활성',suspended:'정지'};
const fmtDate=(iso)=>{if(!iso)return'-';const d=new Date(iso);return d.getFullYear()+'.'+pad(d.getMonth()+1)+'.'+pad(d.getDate());};
async function loadMembers(){
  const r=await sb.from('profiles').select('*').order('created_at',{ascending:false}).limit(5000);
  if(r.error){toast('회원 목록을 불러오지 못했습니다.');return;}
  S.mem.list=r.data;S.mem.loaded=true;await loadVendors();
  if(!S.customCos.length){const c=await sb.from('companies').select('name').limit(5000);if(!c.error)S.customCos=c.data.map(x=>x.name);}
  if(S.tab==='members'&&!S.memDrawer)renderMembers();
}
function memberRows(){
  const m=S.mem;const q=m.q.trim().toLowerCase();
  return m.list.filter(p=>{
    if(m.role!=='all'&&p.role!==m.role)return false;
    if(m.st!=='all'&&(p.status||'active')!==m.st)return false;
    if(q&&![p.login_id,p.name,p.company,p.email,p.dept].join(' ').toLowerCase().includes(q))return false;
    return true;
  });
}
function appCountOf(uid){let n=0;Object.values(S.apps).forEach(a=>{if(a.userId===uid)n++;});return n;}
function renderMembersShell(){
  const m=S.mem;
  let h='<div class="toolbar"><div><h1>회원 관리</h1><p class="sub">가입된 계정의 정보 · 권한 · 이용 상태를 관리합니다. 변경 내역은 계정별로 기록됩니다.</p></div>'
   +'<div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="btn primary sm" style="height:44px" data-act="newVendorAcc">+ 외주사 계정 생성</button><button type="button" class="btn" data-act="reloadMem">새로고침</button></div></div>';
  h+='<div class="summary" id="memSummary"></div>';
  h+='<div class="filters">'
   +'<div class="fld"><label for="mm-role">권한</label><select id="mm-role">'+[['all','전체 권한'],['member','회원'],['vendor','외주사'],['admin','관리자']].map(([v,l])=>'<option value="'+v+'"'+(m.role===v?' selected':'')+'>'+l+'</option>').join('')+'</select></div>'
   +'<div class="fld"><label for="mm-st">상태</label><select id="mm-st">'+[['all','전체 상태'],['active','활성'],['suspended','정지']].map(([v,l])=>'<option value="'+v+'"'+(m.st===v?' selected':'')+'>'+l+'</option>').join('')+'</select></div>'
   +'<div class="fld grow"><label for="mm-q">검색</label><input type="search" id="mm-q" placeholder="아이디 · 이름 · 회사 · 부서 · 이메일" value="'+esc(m.q)+'"></div>'
   +'</div><div id="members"></div>';
  $('main').innerHTML=h;
  if(!m.loaded){$('members').innerHTML='<div class="listbox"><div class="empty">회원 목록을 불러오는 중…</div></div>';loadMembers();}
  else renderMembers();
}
function renderMembers(){
  const el=$('members');if(!el)return;
  const all=S.mem.list;const sm=$('memSummary');
  if(sm){const c={total:all.length,admin:all.filter(p=>p.role==='admin').length,suspended:all.filter(p=>p.status==='suspended').length,custom:all.filter(p=>p.role==='vendor').length};
    sm.innerHTML=[['전체 회원',c.total,'p-req','회'],['관리자',c.admin,'p-ok','관'],['정지 계정',c.suspended,'p-adj','정'],['외주사 계정',c.custom,'p-rev','외']].map(([l,n,cls,ch])=>'<div class="sum"><span class="dot '+cls+'">'+ch+'</span><div><div class="l">'+l+'</div><div class="n">'+n+'<span style="font-size:12px;font-weight:400;color:var(--ink-3)"> 명</span></div></div></div>').join('');}
  const rows=memberRows();
  if(!rows.length){el.innerHTML='<div class="listbox"><div class="empty">조건에 맞는 회원이 없습니다.</div></div>';return;}
  let h='<div class="ledgerhead"><span><b>'+rows.length+'</b>명</span></div><div class="listbox"><table class="list"><thead><tr><th></th><th>아이디</th><th>이름</th><th>회사</th><th>부서</th><th>이메일</th><th>권한</th><th>상태</th><th>신청</th><th>가입일</th></tr></thead><tbody>';
  rows.forEach(p=>{
    const me=p.id===S.me.id;
    h+='<tr><td><button type="button" class="btn sm" data-mem="'+p.id+'">관리</button></td><td style="white-space:nowrap"><b>'+esc(p.login_id)+'</b>'+(me?' <span class="tag adm">나</span>':'')+'</td><td>'+esc(p.name)+'</td>'
     +'<td>'+esc(p.company)+(p.company_source==='custom'?' <span class="tag sympo">직접입력</span>':'')+'</td><td>'+esc(p.dept||'-')+'</td><td>'+esc(p.email||'-')+'</td>'
     +'<td><span class="stbadge '+(p.role==='admin'?'p-ok':p.role==='vendor'?'p-rev':'p-oth')+'" style="font-size:12px">'+ROLE_LABEL[p.role]+'</span></td>'
     +'<td><span class="stbadge '+(p.status==='suspended'?'p-adj':'p-req')+'" style="font-size:12px">'+MST_LABEL[p.status||'active']+'</span></td>'
     +'<td class="num">'+appCountOf(p.id)+'</td><td class="num">'+fmtDate(p.created_at)+'</td></tr>';
  });
  h+='</tbody></table></div>';
  if(S.vendors.length){
    h+='<h2 style="font-size:16px;margin:24px 0 10px">외주사 목록</h2><div class="listbox"><table class="list" style="min-width:520px"><thead><tr><th>외주사</th><th>계정</th><th>배정 세미나</th><th>등록일</th></tr></thead><tbody>'
     +S.vendors.map(v=>'<tr><td><b>'+esc(v.name)+'</b></td><td class="num">'+S.mem.list.filter(p=>p.vendor_id===v.id).length+'</td><td class="num">'+Object.values(S.apps).filter(a=>a.vendorId===v.id).length+'</td><td class="num">'+fmtDate(v.created_at)+'</td></tr>').join('')+'</tbody></table></div>';
  }
  el.innerHTML=h;
}
async function openMember(id){
  const p=S.mem.list.find(x=>x.id===id);if(!p)return;S.memDrawer=id;
  const me=id===S.me.id;
  const apps=Object.entries(S.apps).filter(([k,a])=>a.userId===id).sort((x,y)=>sortKey(x[0])<sortKey(y[0])?1:-1).slice(0,10);
  let h='<div class="scrim" id="scrim"><div class="drawer" role="dialog" aria-modal="true" aria-labelledby="md-t">'
   +'<div class="dh2"><div><div style="font-size:12px;color:var(--accent);font-weight:500">회원 계정</div><div id="md-t" style="font-size:17px;font-weight:700">'+esc(p.login_id)+' · '+esc(p.name)+'</div><div style="font-size:13px;color:var(--ink-2)">가입 '+fmtDate(p.created_at)+(p.updated_at?' · 최근 변경 '+fmtDate(p.updated_at):'')+'</div></div><button type="button" class="iconbtn" data-act="closeRec" aria-label="닫기"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>';
  h+='<div class="sec"><h2>권한 · 이용 상태</h2>'
   +(me?'<div class="note info">본인 계정의 권한과 상태는 바꿀 수 없습니다. 다른 관리자에게 요청하세요.</div>':'')
   +'<div class="row2"><div class="fld"><label for="md-role">권한</label><select id="md-role"'+(me?' disabled':'')+'><option value="member"'+(p.role==='member'?' selected':'')+'>회원 — 신청 사이트 이용</option><option value="vendor"'+(p.role==='vendor'?' selected':'')+'>외주사 — 배정 세미나 조회만</option><option value="admin"'+(p.role==='admin'?' selected':'')+'>관리자 — 관리자 사이트 이용</option></select></div>'
   +'<div class="fld"><label for="md-st">상태</label><select id="md-st"'+(me?' disabled':'')+'><option value="active"'+((p.status||'active')==='active'?' selected':'')+'>활성</option><option value="suspended"'+(p.status==='suspended'?' selected':'')+'>정지 — 로그인 및 조회 차단</option></select></div></div>'
   +'<div class="fld"><label for="md-vendor">소속 외주사 (외주사 권한일 때)</label><select id="md-vendor"'+(me?' disabled':'')+'><option value="">선택</option>'+S.vendors.map(v=>'<option value="'+v.id+'"'+(v.id===p.vendor_id?' selected':'')+'>'+esc(v.name)+'</option>').join('')+'</select></div>'
   +'<span style="font-size:12px;color:var(--ink-3)">외주사로 바꾸면 세미나 신청이 막히고, 그 외주사에 배정된 세미나만 볼 수 있습니다. 관리자로 바꾸면 이 계정은 신청 사이트 대신 관리자 사이트에서 로그인하며, 모든 회사의 신청 상세와 정산 기록을 볼 수 있습니다.</span></div>';
  h+='<div class="sec"><h2>회원 정보</h2><div class="row2">'
   +'<div class="fld"><label for="md-name">이름</label><input id="md-name" value="'+esc(p.name)+'"></div>'
   +'<div class="fld"><label for="md-co">회사(소속)</label><input id="md-co" list="md-co-list" value="'+esc(p.company)+'"><datalist id="md-co-list">'+PHARMA.concat(S.customCos).map(c=>'<option value="'+esc(c)+'"></option>').join('')+'</datalist></div>'
   +'<div class="fld"><label for="md-dept">부서</label><input id="md-dept" value="'+esc(p.dept||'')+'"></div>'
   +'<div class="fld"><label for="md-mail">이메일</label><input id="md-mail" type="email" value="'+esc(p.email||'')+'"></div>'
   +'</div><span style="font-size:12px;color:var(--ink-3)">회사를 바꾸면 이 계정이 볼 수 있는 일정 범위도 바뀝니다. 이미 신청한 일정의 회사는 그대로 유지됩니다.</span></div>';
  h+='<div class="sec"><h2>최근 신청 ('+appCountOf(id)+'건)</h2>'+(apps.length?'<dl class="kv">'+apps.map(([k,a])=>'<div><dt>'+esc(ST[a.status].label)+'</dt><dd>'+esc(slotLabel(k))+' · '+esc(a.title)+'</dd></div>').join('')+'</dl>':'<span style="color:var(--ink-3);font-size:13px">신청 내역이 없습니다.</span>')+'</div>';
  h+='<div class="sec"><h2>변경 이력</h2><div id="md-logs" style="font-size:13px;color:var(--ink-3)">불러오는 중…</div></div>';
  h+='<div class="sec"><h2>비밀번호</h2><span style="font-size:13px;color:var(--ink-2)">비밀번호 초기화는 보안상 이 화면에서 하지 않습니다. Supabase 대시보드 → Authentication → Users 에서 해당 계정('+esc(p.login_id)+'@…)을 찾아 처리하세요.</span></div>';
  h+='<div class="foot"><button type="button" class="btn primary" style="flex:1" data-act="saveMem">변경 저장</button><button type="button" class="btn" data-act="closeRec">닫기</button></div></div></div>';
  $('drawerHost').innerHTML=h;
  const r=await sb.from('account_logs').select('*').eq('target_id',id).order('created_at',{ascending:false}).limit(30);
  const el=$('md-logs');if(!el)return;
  if(r.error||!r.data.length){el.textContent=r.error?'이력을 불러오지 못했습니다.':'변경 이력이 없습니다.';return;}
  const who=(uid)=>{const x=S.mem.list.find(m=>m.id===uid);return x?x.login_id:'시스템';};
  const AL={role:'권한',status:'상태',company:'회사',profile:'정보'};
  el.innerHTML='<dl class="kv">'+r.data.map(l=>{const d=new Date(l.created_at);return '<div><dt>'+(d.getMonth()+1)+'.'+d.getDate()+' '+pad(d.getHours())+':'+pad(d.getMinutes())+'</dt><dd>'+esc((AL[l.action]||l.action)+' · '+l.detail+' (처리: '+who(l.actor_id)+')')+'</dd></div>';}).join('')+'</dl>';
}
async function saveMember(){
  const id=S.memDrawer;const p=S.mem.list.find(x=>x.id===id);if(!p)return;
  const v=(i)=>($(i).value||'').trim();
  const patch={name:v('md-name'),company:v('md-co'),dept:v('md-dept'),email:v('md-mail')};
  if(id!==S.me.id){patch.role=$('md-role').value;patch.status=$('md-st').value;
    if(patch.role==='vendor'){const vv=$('md-vendor').value;if(!vv){toast('외주사 권한에는 소속 외주사를 선택해야 합니다.');return;}patch.vendor_id=Number(vv);delete patch.company;}}
  if(!patch.name||!patch.company){toast('이름과 회사는 비워 둘 수 없습니다.');return;}
  const changed=Object.keys(patch).some(k=>(p[k]==null?'':p[k])!==patch[k]);
  if(!changed){closeRecord();return;}
  const r=await sb.from('profiles').update(patch).eq('id',id).select().single();
  if(r.error){toast(errMsg(r.error,'저장하지 못했습니다. 다시 시도하세요.'));return;}
  if(patch.role!=='vendor'&&patch.company&&!PHARMA.includes(patch.company)&&!S.customCos.includes(patch.company)){await sb.from('companies').insert({name:patch.company,added_by:S.me.id});S.customCos.push(patch.company);}
  const i=S.mem.list.findIndex(x=>x.id===id);S.mem.list[i]=r.data;
  toast((patch.role&&patch.role!==p.role)?'권한을 '+ROLE_LABEL[patch.role]+'(으)로 바꿨습니다.':'회원 정보를 저장했습니다.');
  closeRecord();
}

function genPassword(){const c='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';const a=new Uint32Array(12);crypto.getRandomValues(a);return Array.from(a,x=>c[x%c.length]).join('')+'!7';}
function openVendorCreate(){
  S.memDrawer='new';
  let h='<div class="scrim" id="scrim"><div class="drawer" role="dialog" aria-modal="true" aria-labelledby="vc-t">'
   +'<div class="dh2"><div><div style="font-size:12px;color:var(--accent);font-weight:500">외주사 계정</div><div id="vc-t" style="font-size:17px;font-weight:700">외주사 계정 생성</div><div style="font-size:13px;color:var(--ink-2)">생성된 계정은 세미나를 신청할 수 없고, 배정된 세미나만 조회합니다.</div></div><button type="button" class="iconbtn" data-act="closeRec" aria-label="닫기"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>'
   +'<form id="vcForm" novalidate><div class="sec"><h2>외주사</h2><div class="row2">'
   +'<div class="fld"><label for="vc-vendor">기존 외주사</label><select id="vc-vendor"><option value="">새 외주사 등록</option>'+S.vendors.map(v=>'<option value="'+v.id+'">'+esc(v.name)+'</option>').join('')+'</select></div>'
   +'<div class="fld"><label for="vc-vname">새 외주사 이름</label><input id="vc-vname" placeholder="예) OO미디어"></div></div></div>'
   +'<div class="sec"><h2>로그인 정보</h2><div class="row2">'
   +'<div class="fld"><label for="vc-id">아이디 <span class="req-mark">*</span></label><input id="vc-id" placeholder="영문 소문자·숫자 4~20자" autocomplete="off"></div>'
   +'<div class="fld"><label for="vc-pw">임시 비밀번호 <span class="req-mark">*</span></label><input id="vc-pw" autocomplete="off" value="'+esc(genPassword())+'"></div>'
   +'<div class="fld"><label for="vc-name">담당자 이름 <span class="req-mark">*</span></label><input id="vc-name"></div>'
   +'<div class="fld"><label for="vc-mail">이메일</label><input id="vc-mail" type="email"></div></div>'
   +'<span style="font-size:12px;color:var(--ink-3)">임시 비밀번호는 생성 후 한 번만 표시됩니다. 외주사 담당자에게 안전한 경로로 전달하세요.</span>'
   +'<div class="err" role="alert" id="vc-err" hidden></div></div></form>'
   +'<div class="sec" id="vc-done" hidden></div>'
   +'<div class="foot"><button type="button" class="btn primary" style="flex:1" data-act="createVendorAcc" id="vc-btn">계정 생성</button><button type="button" class="btn" data-act="closeRec">닫기</button></div></div></div>';
  $('drawerHost').innerHTML=h;$('vc-vendor').focus();
}
async function createVendorAccount(){
  const v=(i)=>($(i).value||'').trim();const err=(m)=>{const e=$('vc-err');e.textContent=m;e.hidden=false;$('vc-btn').disabled=false;};
  const id=v('vc-id').toLowerCase(),pw=$('vc-pw').value,name=v('vc-name'),mail=v('vc-mail');
  let vid=$('vc-vendor').value?Number($('vc-vendor').value):null;const vname=v('vc-vname');
  if(!vid&&vname.length<2)return err('기존 외주사를 고르거나 새 외주사 이름을 입력하세요.');
  if(!/^[a-z0-9]{4,20}$/.test(id))return err('아이디는 영문 소문자와 숫자 4~20자로 입력하세요.');
  if(pw.length<8)return err('임시 비밀번호는 8자 이상이어야 합니다.');
  if(!name)return err('담당자 이름을 입력하세요.');
  $('vc-btn').disabled=true;
  if(!vid){
    const ex=S.vendors.find(x=>x.name===vname);
    if(ex)vid=ex.id;else{const r=await sb.from('vendors').insert({name:vname}).select().single();if(r.error)return err(errMsg(r.error,'외주사를 등록하지 못했습니다.'));vid=r.data.id;S.vendors.push(r.data);}
  }
  const inv=await sb.from('vendor_invites').upsert({login_id:id,vendor_id:vid,name,email:mail,created_by:S.me.id,created_at:new Date().toISOString()});
  if(inv.error)return err(errMsg(inv.error,'계정 초대를 만들지 못했습니다.'));
  const tmp=window.supabase.createClient(CFG.SUPABASE_URL,CFG.SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false,storageKey:'dv-vendor-create'}});
  const r=await tmp.auth.signUp({email:idEmail(id),password:pw,options:{data:{login_id:id,name,company:vendorName(vid),company_source:'list',contact_email:mail}}});
  try{await tmp.auth.signOut();}catch(e){}
  if(r.error){await sb.from('vendor_invites').delete().eq('login_id',id);const m=r.error.message||'';return err(/already|registered|exists/i.test(m)?'이미 사용 중인 아이디입니다.':'계정을 만들지 못했습니다: '+m);}
  $('vcForm').hidden=true;$('vc-btn').hidden=true;
  const site=location.origin+location.pathname.replace(/admin\/?(index\.html)?$/,'');
  const d=$('vc-done');d.hidden=false;
  d.innerHTML='<h2>계정을 만들었습니다</h2><div class="note info" style="display:flex;flex-direction:column;gap:4px"><span>외주사: <b>'+esc(vendorName(vid))+'</b></span><span>로그인 주소: <b>'+esc(site)+'</b></span><span>아이디: <b>'+esc(id)+'</b></span><span>임시 비밀번호: <b>'+esc(pw)+'</b></span></div>'
   +'<button type="button" class="btn sm" data-act="copyVendorAcc" style="align-self:flex-start">로그인 정보 복사</button><span style="font-size:12px;color:var(--ink-3)">이 창을 닫으면 비밀번호를 다시 볼 수 없습니다.</span>';
  S.vcCopy='닥터빌 세미나 외주사 계정\n주소: '+site+'\n아이디: '+id+'\n임시 비밀번호: '+pw;
  toast('외주사 계정을 만들었습니다.');S.mem.loaded=false;loadMembers();
}

/* ---------- export ---------- */
function loadScript(src){return new Promise((res,rej)=>{if(document.querySelector('script[src="'+src+'"]'))return res();const s=document.createElement('script');s.src=src;s.onload=res;s.onerror=rej;document.head.appendChild(s);});}
function exportMatrix(){const rows=ledgerRows();return{head:COLS.map(c=>c[0]),body:rows.map(([k,a],i)=>COLS.map(([l,fn])=>fn(a,k,i)))};}
function fileStamp(){const al=S.al;if(al.scope==='month')return al.y+pad(al.m+1);if(al.scope==='range')return (al.from||'start').replace(/-/g,'')+'-'+(al.to||'end').replace(/-/g,'');return '전체';}
function saveFile(name,blob){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},1500);}
async function exportXlsx(){
  const m=exportMatrix();if(!m.body.length){toast('내보낼 신청이 없습니다.');return;}
  try{await loadScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');}catch(e){toast('Excel 변환 도구를 불러오지 못했습니다.');return;}
  const XL=window.XLSX;const ws=XL.utils.aoa_to_sheet([m.head].concat(m.body));
  ws['!cols']=m.head.map(h=>({wch:WRAP.has(h)?36:(h.length<6?12:16)}));
  const wb=XL.utils.book_new();XL.utils.book_append_sheet(wb,ws,'신청현황');
  saveFile('닥터빌_세미나신청현황_'+fileStamp()+'.xlsx',new Blob([XL.write(wb,{bookType:'xlsx',type:'array'})],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
}
async function exportPdf(){
  const m=exportMatrix();if(!m.body.length){toast('내보낼 신청이 없습니다.');return;}
  toast('PDF를 만드는 중입니다…');
  try{await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');}catch(e){toast('PDF 변환 도구를 불러오지 못했습니다.');return;}
  const stage=$('pdfStage');
  stage.innerHTML='<h2>닥터빌 세미나 신청 현황</h2><p>'+esc(periodLabel())+' · '+m.body.length+'건 · 출력 '+todayStr+'</p><table><thead><tr>'+m.head.map(h=>'<th>'+esc(h)+'</th>').join('')+'</tr></thead><tbody>'
   +m.body.map(r=>'<tr>'+r.map((v,i)=>{const h=m.head[i];const isN=MONEY.has(h)||NUMS.has(h);return '<td class="'+(WRAP.has(h)?'w':'')+(isN?' n':'')+'">'+esc(isN&&typeof v==='number'?fmtN(v):v)+'</td>';}).join('')+'</tr>').join('')+'</tbody></table>';
  try{
    const canvas=await window.html2canvas(stage,{scale:2,backgroundColor:'#FFFFFF'});
    const pdf=new window.jspdf.jsPDF({orientation:'l',unit:'mm',format:'a3'});
    const pw=pdf.internal.pageSize.getWidth()-20,ph=pdf.internal.pageSize.getHeight()-20;
    const ratio=pw/canvas.width;const pagePx=Math.floor(ph/ratio);
    for(let y=0,p=0;y<canvas.height;y+=pagePx,p++){
      const c=document.createElement('canvas');c.width=canvas.width;c.height=Math.min(pagePx,canvas.height-y);
      c.getContext('2d').drawImage(canvas,0,y,canvas.width,c.height,0,0,canvas.width,c.height);
      if(p)pdf.addPage();pdf.addImage(c.toDataURL('image/jpeg',0.92),'JPEG',10,10,pw,c.height*ratio);
    }
    stage.innerHTML='';saveFile('닥터빌_세미나신청현황_'+fileStamp()+'.pdf',pdf.output('blob'));
  }catch(e){stage.innerHTML='';toast('PDF를 만들지 못했습니다.');}
}

/* ---------- notifications tab ---------- */
function renderNoti(){
  let h='<div class="toolbar"><div><h1>알림</h1><p class="sub">'+(isAdmin()?'신규 접수와 신청자의 신청 변경을 알려 드립니다.':'내 신청의 진행 상태가 바뀌면 알려 드립니다.')+'</p></div>'+(S.notis.some(n=>!n.read)?'<button type="button" class="btn" data-act="readAll">모두 읽음으로 표시</button>':'')+'</div>';
  const perm=canDesktop()?Notification.permission:'unsupported';
  h+='<div class="npref"><div style="display:flex;flex-direction:column;gap:2px"><b>알림 받는 방법</b><span style="font-size:12px;color:var(--ink-3)">사이트가 열려 있는 동안(다른 탭에 있어도) 알림을 받습니다. 설정은 이 브라우저에만 저장됩니다.</span></div>'
   +'<div style="display:flex;gap:16px;flex-wrap:wrap;align-items:center"><label class="chk"><input type="checkbox" id="np-pop"'+(S.pref.pop?' checked':'')+'>화면 팝업</label><label class="chk"><input type="checkbox" id="np-sound"'+(S.pref.sound?' checked':'')+'>알림음</label>'
   +(perm==='granted'?'<label class="chk"><input type="checkbox" id="np-desk"'+(S.pref.desktop?' checked':'')+'>윈도우 알림</label>':perm==='denied'?'<span style="font-size:12px;color:var(--ink-3)">윈도우 알림이 차단되어 있습니다. 주소창 왼쪽 자물쇠 → 알림 → 허용으로 바꿔 주세요.</span>':perm==='default'?'<button type="button" class="btn sm" data-act="askDesk">윈도우 알림 켜기</button>':'')
   +'<button type="button" class="btn sm" data-act="testNoti">알림 미리보기</button></div></div>';
  if(!S.notis.length)h+='<div class="noti"><div class="empty">새 알림이 없습니다.</div></div>';
  else h+='<div class="noti">'+S.notis.map(n=>{const d=new Date(n.at);return '<div class="it'+(n.read?'':' unread')+'">'+(n.kind?'<span class="kchip k-'+esc(n.kind)+'">'+esc(KIND[n.kind]||'')+'</span>':'')+'<div style="flex:1;min-width:0">'+esc(n.text)+'</div><time>'+(d.getMonth()+1)+'.'+d.getDate()+' '+pad(d.getHours())+':'+pad(d.getMinutes())+'</time>'+(n.key?'<button type="button" class="btn sm" data-goto="'+esc(n.key)+'">보기</button>':'')+'</div>';}).join('')+'</div>';
  $('main').innerHTML=h;
}
function gotoSlot(k){const d=new Date(k.split('_')[0]+'T00:00:00');S.y=d.getFullYear();S.m=d.getMonth();S.tab='cal';renderTop();renderApp();if(S.apps[k]||S.locks.has(k))selectSlot(k);}

/* ---------- events ---------- */
document.addEventListener('click',async(e)=>{
  if(S.me)unlockAudio();
  if(e.target.id==='scrim'){closeRecord();return;}
  const t=e.target.closest('button');if(!t)return;
  if(t.dataset.tab){S.tab=t.dataset.tab;renderTop();renderApp();return;}
  if(t.dataset.key){selectSlot(t.dataset.key);return;}
  if(t.dataset.goto){gotoSlot(t.dataset.goto);return;}
  if(t.dataset.rec){openRecord(t.dataset.rec);return;}
  if(t.dataset.mem){openMember(t.dataset.mem);return;}
  if(t.dataset.co){S.su.coSel=t.dataset.co;S.su.coMode='search';renderCoPicker();return;}
  if(t.dataset.scope){S.al.scope=t.dataset.scope;renderLedgerShell();return;}
  if(t.dataset.pick){const [f,v]=t.dataset.pick.split(':');S.form[f]=v;renderPanel();return;}
  if(t.dataset.cat){S.form.cat=t.dataset.cat;S.form.catNewKind='';renderCatPicker();return;}
  if(t.dataset.catkind){S.cat.kind=t.dataset.catkind;renderCatPicker();const q=$('cat-q')||$('cat-custom');q&&q.focus();return;}
  const a=t.dataset.act;if(!a)return;
  if(a==='goSignup'){S.err='';S.view='signup';renderSignup();}
  else if(a==='goLogin'){S.err='';S.view='login';renderLogin();}
  else if(a==='logout')logout();
  else if(a==='coCustom'){S.su.coMode='custom';renderCoPicker();}
  else if(a==='coSearch'){S.su.coMode='search';renderCoPicker();}
  else if(a==='coCustomOk'){const v=($('su-co-custom').value||'').trim();if(v.length<2){toast('회사명을 2글자 이상 입력하세요.');return;}S.su.coSel=v;S.su.coMode=PHARMA.includes(v)?'search':'custom';renderCoPicker();}
  else if(a==='coChange'){S.su.coSel='';S.su.coMode='search';renderCoPicker();$('su-co-q')&&$('su-co-q').focus();}
  else if(a==='prevM'){S.m--;if(S.m<0){S.m=11;S.y--;}renderCal();}
  else if(a==='nextM'){S.m++;if(S.m>11){S.m=0;S.y++;}renderCal();}
  else if(a==='alPrev'){S.al.m--;if(S.al.m<0){S.al.m=11;S.al.y--;}renderLedgerShell();}
  else if(a==='alNext'){S.al.m++;if(S.al.m>11){S.al.m=0;S.al.y++;}renderLedgerShell();}
  else if(a==='catCustom'){S.cat.mode='custom';renderCatPicker();$('cat-custom')&&$('cat-custom').focus();}
  else if(a==='catSearch'){S.cat.mode='search';renderCatPicker();$('cat-q')&&$('cat-q').focus();}
  else if(a==='catCustomOk'){const v=($('cat-custom').value||'').trim();if(v.length<2){toast('카테고리를 2글자 이상 입력하세요.');return;}S.form.cat=v;S.form.catNewKind=catKind(v)?'':S.cat.kind;S.cat.mode='search';renderCatPicker();}
  else if(a==='catChange'){S.form.cat='';S.form.catNewKind='';S.cat.q='';S.cat.mode='search';renderCatPicker();$('cat-q')&&$('cat-q').focus();}
  else if(a==='addItem'){S.form.items.push('');renderPanel();const i=S.form.items.length-1;$('it-'+i)&&$('it-'+i).focus();}
  else if(a==='rmItem'){S.form.items.splice(Number(t.dataset.i),1);renderPanel();}
  else if(a==='addSpk'){S.form.speakers.push({spk:'',aff:'',topic:''});renderPanel();const i=S.form.speakers.length-1;$('sp-'+i)&&$('sp-'+i).focus();}
  else if(a==='rmSpk'){const i=Number(t.dataset.i),c=S.form.chair;S.form.speakers.splice(i,1);if(c.mode==='spk'){if(c.idx===i){c.mode='none';c.idx=-1;}else if(c.idx>i)c.idx--;}renderPanel();}
  else if(a==='edit'){const x=S.apps[S.sel];S.form=formFromApp(x);resetCatUI();S.editing=true;S.mode='form';S.err='';renderPanel();}
  else if(a==='cancelEdit'){S.editing=false;S.mode='detail';S.err='';renderPanel();}
  else if(a==='askCancel'){S.confirmCancel=true;renderPanel();}
  else if(a==='noCancel'){S.confirmCancel=false;renderPanel();}
  else if(a==='doCancel')doCancel();
  else if(a==='admSave')adminSave();
  else if(a==='closeRec')closeRecord();
  else if(a==='saveRec')saveRecord();
  else if(a==='saveMem')saveMember();
  else if(a==='newVendorAcc')openVendorCreate();
  else if(a==='createVendorAcc')createVendorAccount();
  else if(a==='copyVendorAcc'){try{await navigator.clipboard.writeText(S.vcCopy||'');toast('복사했습니다.');}catch(err){toast('복사하지 못했습니다. 직접 선택해 복사하세요.');}}
  else if(a==='reloadMem')loadMembers();
  else if(a==='expXlsx')exportXlsx();
  else if(a==='expPdf')exportPdf();
  else if(a==='askDesk'){try{const p=await Notification.requestPermission();if(p==='granted'){S.pref.desktop=true;savePref();toast('윈도우 알림을 켰습니다.');}}catch(err){}renderNoti();}
  else if(a==='testNoti'){unlockAudio();alertNew({kind:isAdmin()?'new':'status',text:isAdmin()?'[미리보기] 회사명 · 11월 3일 점심 · 1번 슬롯 · 예시 행사명':'[미리보기] 신청 → 확정 · 11월 3일 점심 · 1번 슬롯 · 예시 행사명',key:''});}
  else if(a==='readAll'){await sb.from('notifications').update({read:true}).eq('user_id',S.me.id).eq('read',false);loadNotis();}
});
document.addEventListener('keydown',(e)=>{if(e.key==='Escape'&&(S.drawer||S.memDrawer))closeRecord();});
document.addEventListener('input',(e)=>{
  const t=e.target;
  if(t.id==='su-co-q'){S.su.coQ=t.value;renderCoResults();return;}
  if(t.id==='su-co-custom'){S.su.coQ=t.value;return;}
  if(t.id==='al-q'){S.al.q=t.value;renderLedger();return;}
  if(t.id==='mm-q'){S.mem.q=t.value;renderMembers();return;}
  if(t.id==='cat-q'){S.cat.q=t.value;renderCatResults();return;}
  if(t.id==='cat-custom'){S.cat.q=t.value;return;}
  if(!S.form)return;
  if(t.id==='f-type'){setType(t.value);return;}
  if(t.id==='f-chair'){setChair(t.value);return;}
  if(t.dataset.f){S.form[t.dataset.f]=t.value;if(['type','mode','recruit'].includes(t.dataset.f)&&$('price'))$('price').innerHTML=priceHtml();}
  else if(t.dataset.sp){const i=Number(t.dataset.sp);S.form.speakers[i][t.dataset.spf]=t.value;if(t.dataset.spf==='spk'){const o=document.querySelector('#f-chair option[value="s'+i+'"]');if(o)o.textContent=chairOptLabel(S.form.speakers[i],i);}}
  else if(t.dataset.it){S.form.items[Number(t.dataset.it)]=t.value;}
  else if(t.dataset.ch){S.form.chair[t.dataset.ch]=t.value;}
});
function setType(v){if(S.form.type===v)return;S.form.type=v;padSympo(S.form);renderPanel();$('f-type')&&$('f-type').focus();}
function setChair(v){const c=S.form.chair;if(v==='none'){c.mode='none';c.idx=-1;}else if(v==='sep'){c.mode='sep';c.idx=-1;}else{c.mode='spk';c.idx=Number(v.slice(1));}renderPanel();$('f-chair')&&$('f-chair').focus();}
document.addEventListener('keydown',(e)=>{
  if(e.key!=='Enter')return;const t=e.target;
  if(t.id==='cat-q'){e.preventDefault();const b=document.querySelector('#catResults button[data-cat]');if(b)b.click();}
  else if(t.id==='cat-custom'){e.preventDefault();const b=document.querySelector('[data-act="catCustomOk"]');b&&b.click();}
});
document.addEventListener('change',(e)=>{
  const t=e.target;
  if(t.id==='np-pop'){S.pref.pop=t.checked;savePref();return;}
  if(t.id==='np-sound'){S.pref.sound=t.checked;savePref();if(t.checked)chime();return;}
  if(t.id==='np-desk'){S.pref.desktop=t.checked;savePref();return;}
  if(t.id==='al-st'){S.al.st=t.value;renderLedger();return;}
  if(t.id==='mm-role'){S.mem.role=t.value;renderMembers();return;}
  if(t.id==='mm-st'){S.mem.st=t.value;renderMembers();return;}
  if(t.id==='al-from'){S.al.from=t.value;renderLedger();return;}
  if(t.id==='al-to'){S.al.to=t.value;renderLedger();return;}
  if(t.id==='f-type'){setType(t.value);return;}
  if(t.id==='f-chair'){setChair(t.value);return;}
  if(t.id==='f-survey'){S.form.surveyOn=t.checked;if(!t.checked)S.form.survey='';renderPanel();}
  else if(t.dataset&&t.dataset.f&&S.form){S.form[t.dataset.f]=t.value;if($('price'))$('price').innerHTML=priceHtml();}
});
document.addEventListener('submit',(e)=>{
  e.preventDefault();
  if(e.target.id==='loginForm')doLogin($('li-id').value,$('li-pw').value);
  else if(e.target.id==='signupForm')doSignup();
  else if(e.target.id==='appForm')submitForm();
});

/* ---------- boot ---------- */
(async()=>{
  renderTop();
  const ok=CFG.SUPABASE_URL&&CFG.SUPABASE_ANON_KEY&&!/YOUR-/.test(CFG.SUPABASE_URL+CFG.SUPABASE_ANON_KEY);
  if(!ok||!window.supabase){$('main').innerHTML='<div class="auth"><div class="card"><h1>연결 설정이 필요합니다</h1><p style="margin:0;color:var(--ink-2)">assets/config.js 에 Supabase 프로젝트 주소(SUPABASE_URL)와 공개 키(SUPABASE_ANON_KEY)를 입력하세요. 자세한 방법은 README를 참고하세요.</p></div></div>';return;}
  sb=window.supabase.createClient(CFG.SUPABASE_URL,CFG.SUPABASE_ANON_KEY,{auth:{persistSession:true,autoRefreshToken:true}});
  const {data}=await sb.auth.getSession();
  if(data&&data.session&&data.session.user){await enter(data.session.user);return;}
  renderLogin();
})();
})();
