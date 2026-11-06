"use client";
import {useEffect,useMemo,useState} from "react";
import { saveConversation, saveDraft } from "./inbox-store";
import TikTokSettings from "./tiktok-settings";

const initial=[
{id:1,type:"comment",name:"محمد العتيبي",handle:"mohammed_ksa",avatar:"م",body:"الكفر هذا يناسب آيفون 18 برو ماكس؟ وهل اللون العنابي متوفر؟",source:"فيديو كفر Link Slim",time:"منذ 6 دقائق",status:"new",assigned:"غير مسند",replies:[],priority:"normal"},
{id:2,type:"dm",name:"عبدالله",handle:"abdullah90",avatar:"ع",body:"السلام عليكم، متى تشحنون الطلبات داخل الرياض؟",source:"رسائل تيك توك",time:"منذ 12 دقيقة",status:"new",assigned:"غير مسند",replies:[],priority:"normal"},
{id:3,type:"comment",name:"سارة",handle:"sarah.77",avatar:"س",body:"بكم باكج كفر سامسونج S26 Ultra مع استيكر الشاشة؟",source:"فيديو باكج سامسونج",time:"منذ 35 دقيقة",status:"open",assigned:"أنس",replies:[],priority:"high"},
{id:4,type:"dm",name:"نورة",handle:"noura_22",avatar:"ن",body:"أبغى أغير لون العدسات قبل شحن الطلب، ممكن؟",source:"رسائل تيك توك",time:"منذ ساعة",status:"open",assigned:"أنس",replies:[],priority:"high"},
{id:5,type:"comment",name:"فهد",handle:"fahad.s",avatar:"ف",body:"وصلني البكج، يعطيكم العافية جودة ممتازة",source:"فيديو الحماية الكاملة",time:"أمس",status:"done",assigned:"أنس",replies:[{by:"أنس",text:"حياك الله، الله يعافيك وشكراً لثقتك 🤍"}],priority:"normal"},
{id:6,type:"comment",name:"تركي",handle:"t.ksa",avatar:"ت",body:"هل عندكم حماية عدسات للآيفون 17 برو؟",source:"فيديو عدسات Link",time:"أمس",status:"new",assigned:"غير مسند",replies:[],priority:"normal"}
];
const Icon=({name,size=19})=>{const paths={inbox:<><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 13h5l2 3h4l2-3h5"/></>,message:<><path d="M21 11a8 8 0 0 1-8 8H6l-3 2v-9a8 8 0 1 1 18-1Z"/></>,chat:<><path d="M4 4h16v13H8l-4 4z"/></>,chart:<><path d="M4 20V10M10 20V4M16 20v-7M22 20V8"/></>,users:<><circle cx="9" cy="8" r="3"/><path d="M2 20v-2a7 7 0 0 1 14 0v2M17 5a3 3 0 0 1 0 6m2 9v-2a6 6 0 0 0-2-4"/></>,settings:<><circle cx="12" cy="12" r="3"/><path d="m12 2 2 2 3-1 1 3 3 2-2 3 2 3-3 2-1 3-3-1-2 2-2-2-3 1-1-3-3-2 2-3-2-3 3-2 1-3 3 1z"/></>,search:<><circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/></>,send:<><path d="m21 3-8 18-3-8-8-3zM21 3 10 13"/></>,check:<path d="m4 12 5 5L20 6"/>,clock:<><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,shield:<><path d="M12 2 4 6v6c0 5 3 8 8 10 5-2 8-5 8-10V6z"/><path d="m8 12 3 3 5-5"/></>,logout:<path d="M10 4H4v16h6m4-4 4-4-4-4m-7 4h11"/>,menu:<path d="M3 6h18M3 12h18M3 18h18"/>,filter:<path d="M3 5h18l-7 8v6l-4 2v-8z"/>,bell:<><path d="M5 17h14l-2-3V9a5 5 0 0 0-10 0v5z"/><path d="M10 21h4"/></>,bolt:<path d="m13 2-9 12h7l-1 8 10-13h-7z"/>};return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]||paths.inbox}</svg>};
export default function Inbox({ team }){
 const [items,setItems]=useState(team?.items ?? initial),[active,setActive]=useState((team?.items ?? initial)[0]?.id),[tab,setTab]=useState("all"),[view,setView]=useState("inbox"),[filter,setFilter]=useState("all"),[query,setQuery]=useState(""),[draft,setDraft]=useState(""),[mobileMenu,setMobileMenu]=useState(false);
 useEffect(() => {
   if (window.location.hash === "#tiktok") setView("settings");
 }, []);

 function receiveImported(items) {
   setItems(items);
   setActive(items[0]?.id);
   setTab("comment");
   setFilter("all");
   setQuery("");
   changeDraft("");
 }

 const list=useMemo(()=>items.filter(x=>(tab==="all"||x.type===tab)&&(filter==="all"||x.status===filter)&&[x.name,x.body,x.source,x.handle].join(" ").toLowerCase().includes(query.toLowerCase())),[items,tab,filter,query]);
 const current=items.find(x=>x.id===active);
 const pending=items.filter(x=>x.status==="new").length;
 const [saving,setSaving]=useState(false),[error,setError]=useState(""),[draftId,setDraftId]=useState(null);
 const canAssign = !team || team.member.role === "manager";
 const unassigned = team ? "" : "غير مسند";
 const assignees = team
   ? team.members.map(member => [member.user_id, member.display_name])
   : [["أنس", "أنس"], ["موظف تجريبي", "موظف تجريبي"]];

 function updateItem(id, apply) {
   setItems(previous => previous.map(item => item.id === id ? apply(item) : item));
 }

 async function persist(write, onSuccess) {
   setSaving(true);
   setError("");
   try {
     await write();
     onSuccess();
   } catch {
     setError("تعذّر حفظ التغيير. جرّب مرة ثانية.");
   } finally {
     setSaving(false);
   }
 }

 function mutate(patch, changes) {
   const id = current.id;
   const update = () => updateItem(id, item => ({ ...item, ...patch }));
   if (!team) return update();
   return persist(() => saveConversation(team.client, id, changes), update);
 }

 function changeDraft(text) {
   setDraft(text);
   setDraftId(null);
 }

 async function reply(event) {
   event.preventDefault();
   const text = draft.trim();
   if (!text || !current || saving) return;

   if (!team) {
     mutate({
       status: "done",
       assigned: current.assigned === unassigned ? "أنس" : current.assigned,
       replies: [...current.replies, { by: "أنس (تجريبي)", text }],
     });
     changeDraft("");
     return;
   }

   const id = draftId ?? crypto.randomUUID();
   const conversationId = current.id;
   setDraftId(id);
   await persist(() => saveDraft(team.client, { id, conversationId, text }), () => {
     updateItem(conversationId, item => ({
       ...item,
       replies: [...item.replies, { id, by: team.member.display_name, text }],
     }));
     changeDraft("");
   });
 }
 const labels={all:"الكل",comment:"التعليقات",dm:"الرسائل",new:"جديد",open:"قيد المعالجة",done:"مغلق"};
 return <div className="shell" dir="rtl">
 <aside className={"sidebar "+(mobileMenu?"expanded":"")}>
 <div className="brand"><div className="brandmark">لـ</div><div><strong>Link Store</strong><span>Customer Inbox</span></div></div>
 <div className="sidecaption">مساحة العمل</div>
 {[["inbox","صندوق الوارد","inbox"],["analytics","الإحصائيات","chart"],["team","الموظفون","users"],["settings","الإعدادات","settings"]].map(([id,label,icon])=><button key={id} className={"nav "+(view===id?"selected":"")} onClick={()=>{setView(id);setMobileMenu(false)}}><Icon name={icon}/><span>{label}</span>{id==="inbox"&&pending>0&&<em>{pending}</em>}</button>)}
 <div className="sidebottom"><span className="dot"/> {team ? "وضع الفريق" : "وضع العرض التجريبي"} <small>{team ? "@link.60" : "لا يوجد اتصال بتيك توك"}</small></div>
 </aside>
 <main className="main">
 <header className="top"><div className="topright"><button className="iconbtn hamburger" aria-label="القائمة" onClick={()=>setMobileMenu(!mobileMenu)}><Icon name="menu"/></button><span className="breadcrumbs">مساحة العمل <b>/</b> {team?.signOutError && <p className="inbox-error" role="alert">{team.signOutError}</p>}
 {view==="inbox"?"صندوق الوارد":view==="analytics"?"الإحصائيات":view==="team"?"الموظفون":"الإعدادات"}</span></div><div className="topactions"><span className="demoTag"><span className="dot"/> {team ? "وضع الفريق" : "Demo Mode"}</span>{team ? <button className="signout" onClick={team.signOut}>تسجيل الخروج</button> : <button className="iconbtn" aria-label="الإشعارات"><Icon name="bell"/></button>}<div className="profile" title={team?.member.display_name}>{team?.member.display_name.slice(0, 1) ?? "أ"}</div></div></header>
 {team?.signOutError && <p className="inbox-error" role="alert">{team.signOutError}</p>}
 {view==="inbox"? <section className="body"><div className="heading"><div><h1>صندوق الوارد</h1><p>إدارة تعليقات ورسائل العملاء في مكان واحد</p></div><span className="mocknotice"><Icon name="shield" size={17}/> {team ? "التعليقات العامة المستوردة" : "بيانات افتراضية للاختبار فقط"}</span></div>
 <div className="stats"><div className="stat"><span>المحادثات الإجمالية</span><strong>{items.length}</strong><small>{team ? "أحدث 100 محادثة" : "في بيانات العرض"}</small></div><div className="stat"><span>بانتظار الرد</span><strong>{pending}</strong><small>تحتاج اهتمامك</small></div><div className="stat"><span>قيد المعالجة</span><strong>{items.filter(x=>x.status==="open").length}</strong><small>محادثات مفتوحة</small></div><div className="stat"><span>{team ? "مغلقة" : "تم الرد"}</span><strong>{items.filter(x=>x.status==="done").length}</strong><small>حالات مغلقة</small></div></div>
 {error && <p className="inbox-error" role="alert">{error}</p>}
 <div className="workspace"><div className="listing"><div className="listhead"><h2>المحادثات <span>{list.length}</span></h2><div className="switches">{[["all","الكل"],["comment","التعليقات"],["dm","الرسائل"]].map(([v,l])=><button key={v} className={tab===v?"on":""} onClick={()=>setTab(v)}>{l}</button>)}</div><div className="searchbar"><Icon name="search" size={17}/><input aria-label="بحث في المحادثات" value={query} onChange={e=>setQuery(e.target.value)} placeholder="ابحث عن عميل أو تعليق..."/></div><div className="filterrow"><Icon name="filter" size={15}/><select aria-label="تصفية الحالة" value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">جميع الحالات</option><option value="new">جديد</option><option value="open">قيد المعالجة</option><option value="done">مغلق</option></select></div></div>
 <div className="entries">{list.length?list.map(x=><button key={x.id} className={"entry "+(active===x.id?"active":"")} disabled={saving} onClick={()=>{setActive(x.id);changeDraft("");setError("")}}><div className="avatar">{x.avatar}</div><div className="entrydetails"><div className="entrytop"><strong>{x.name}</strong><small>{x.time}</small></div><div className="entrytext">{x.body}</div><div className="entrybottom"><span className={"type "+x.type}>{x.type==="comment"?"تعليق":"رسالة"}</span><span className={"status "+x.status}>{labels[x.status]}</span></div></div></button>):<div className="empty">لا توجد نتائج مطابقة</div>}</div></div>
 <div className="conversation">{current?<><div className="convhead"><div className="person"><div className="avatar large">{current.avatar}</div><div><h2>{current.name}</h2><span>@{current.handle}</span></div></div><span className={"status "+current.status}>{labels[current.status]}</span></div><div className="context"><span>{current.type==="comment"?"تعليق على منشور":"رسالة خاصة"}</span><b>{current.tiktok_video_id ? <a href={`https://www.tiktok.com/@link.60/video/${current.tiktok_video_id}`} target="_blank" rel="noreferrer">{current.source}</a> : current.source}</b><small>{current.time}</small></div><div className="thread"><div className="bubble customer"><span>{current.name}</span><p>{current.body}</p></div>{current.replies.map((r,i)=><div className="bubble agent" key={r.id ?? i}><span>{r.by}</span><p>{r.text}</p></div>)}<div className="threadhint"><Icon name="shield" size={14}/> {team ? "المسودات داخلية وغير منشورة على تيك توك" : "الردود هنا محلية وتجريبية ولا تُرسل إلى TikTok"}</div></div><form onSubmit={reply} className="composer"><textarea aria-label={team ? "اكتب مسودة الرد" : "اكتب الرد التجريبي"} placeholder="اكتب ردك على العميل..." value={draft} onChange={e=>changeDraft(e.target.value)} rows="3" maxLength={team ? 4000 : undefined} disabled={saving}/><div className="composebar"><span>{team ? "حفظ داخلي للفريق" : "وضع تجريبي • لا يتم إرسال أي رسالة"}</span><button type="submit" disabled={saving || !draft.trim()}><Icon name="send" size={17}/> {team ? "حفظ المسودة" : "حفظ رد تجريبي"}</button></div></form></>:<div className="empty">اختر محادثة لعرض تفاصيلها</div>}</div>
 <div className="details"><h2>تفاصيل المحادثة</h2>{current&&<><div className="detailavatar">{current.avatar}</div><h3>{current.name}</h3><p className="handle">@{current.handle}</p><div className="detailrow"><span>النوع</span><b>{current.type==="comment"?"تعليقات المنشورات":"الرسائل الخاصة"}</b></div><div className="detailrow"><span>المسؤول</span><select aria-label="المسؤول" value={current.assigned} disabled={saving || !canAssign} onChange={e=>mutate({assigned:e.target.value}, {assigned_to:e.target.value || null})}><option value={unassigned}>غير مسند</option>{current.assigned !== unassigned && !assignees.some(([id])=>id===current.assigned) && <option value={current.assigned} disabled>عضو سابق</option>}{assignees.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></div><div className="detailrow"><span>الحالة</span><select aria-label="حالة المحادثة" value={current.status} disabled={saving} onChange={e=>mutate({status:e.target.value}, {status:e.target.value})}><option value="new">جديد</option><option value="open">قيد المعالجة</option><option value="done">مغلق</option></select></div><div className="detailrow"><span>الأولوية</span><b>{current.priority==="high"?"مرتفعة":"عادية"}</b></div><div className="detailnote">{team ? "تُحفظ الحالة والمسؤول والمسودات في صندوق الوارد." : "التعديلات مؤقتة داخل هذه الصفحة. لن تُحفظ في قاعدة بيانات ولن تؤثر على حساب TikTok."}</div></>}</div></div></section>:
 <section className="body secondary"><div className="heading"><div><h1>{view==="analytics"?"إحصائيات خدمة العملاء":view==="team"?"إدارة الموظفين":"إعدادات التكامل"}</h1><p>{team ? "مساحة عمل فريق خدمة العملاء" : "معاينة أولية — غير متصلة ببيانات فعلية"}</p></div></div>{view==="analytics"?<div className="placeholderCard"><Icon name="chart" size={32}/><h2>تقارير أولية</h2><p>عدد الحالات المعروضة: {items.length} • مغلقة: {items.filter(x=>x.status==="done").length}</p><p>ستظهر تقارير وقت الرد وأداء الموظفين بعد تفعيل حفظ البيانات.</p></div>:view==="team"?<div className="placeholderCard"><Icon name="users" size={32}/><h2>حسابات الفريق</h2>{team ? <ul>{team.members.map(person=><li key={person.user_id}>{person.display_name} · {person.role === "manager" ? "مدير" : "موظف"}</li>)}</ul> : <p>تظهر حسابات الفريق بعد إعداد تسجيل الدخول.</p>}</div>:<div className="placeholderCard"><Icon name="settings" size={32}/><h2>حالة التكامل</h2><p>التعليقات العامة متاحة للاستيراد بعد تفويض الحساب.</p><p>Business Messaging API: تم تقديم الطلب، وحالة الموافقة غير مؤكدة.</p></div>}{view === "settings" && team?.member.role === "manager" && <TikTokSettings team={team} onImported={receiveImported} />}</section>}
 </main></div>;
}
