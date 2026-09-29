document.addEventListener('DOMContentLoaded', async () => {
await window.AGENT_DATA_READY;
if(window.math2booted)return; window.math2booted=true;
const D=window.STUDY, all=[...(window.PAPERS?.questions||[]),...D.questions];
const byId=new Map(all.map(q=>[q.id,q]));
const QA=new URLSearchParams(location.search).has('qa');
const KEY='math2-study-v1-agent-'+window.HUB_USER_NAMESPACE+(QA?'-qa':''), day=86400000;
if(QA){document.querySelector('header .badge').textContent='测试预览 · 独立记录';const english=document.querySelector('[data-subject=english]'),politics=document.querySelector('[data-subject=politics]');if(english)english.href='english.html?qa=1';if(politics)politics.href='politics.html?qa=1';}
const blank=()=>({version:1,records:{},exams:{},read:[],customMistakes:[],associationCards:[],last:null});
let state=blank(), storageWarning='', recoveryRaw=null, timer=null, toastTimer;
try{recoveryRaw=localStorage.getItem(KEY);if(recoveryRaw)state=validate(JSON.parse(recoveryRaw));recoveryRaw=null;}catch{storageWarning='之前的学习记录未能读取。请先导出原始记录，暂时不要覆盖；本次练习只在当前页面保存。';}
function validate(s){
 if(!s||s.version!==1||!s.records||typeof s.records!=='object'||Array.isArray(s.records)||!s.exams||typeof s.exams!=='object'||Array.isArray(s.exams)||!Array.isArray(s.read))throw Error('不是本站的备份文件');
 const out=blank();
 for(const [id,r] of Object.entries(s.records)){
  if(!byId.has(id)||!r||typeof r!=='object')continue;
  const n={};for(const k of ['answer','notes','cause','status'])if(typeof r[k]==='string')n[k]=r[k].slice(0,20000);
  if(n.status&&!['wrong','shaky','mastered'].includes(n.status))delete n.status;
  for(const k of ['favorite','wrong','revealed','checked','correct'])if(typeof r[k]==='boolean')n[k]=r[k];
  for(const k of ['due','last'])if(Number.isFinite(r[k])&&r[k]>=0)n[k]=r[k];
  out.records[id]=n;
 }
 for(const [id,e] of Object.entries(s.exams)){
  const spec=D.mocks.find(m=>m.id===id);if(!spec||!e||!Number.isFinite(e.start)||e.start<0)continue;
  const n={start:e.start,end:Number.isFinite(e.end)&&e.end>=e.start?e.end:e.start+spec.minutes*60000,submitted:e.submitted===true,answers:{},grades:{}};
  if(!n.submitted&&Number.isFinite(e.pausedAt)&&e.pausedAt>=e.start)n.pausedAt=e.pausedAt;
  for(const q of D.questions.filter(q=>q.mock===id)){
   if(typeof e.answers?.[q.id]==='string')n.answers[q.id]=e.answers[q.id].slice(0,20000);
   if(Number.isFinite(e.grades?.[q.id])&&e.grades[q.id]>=0&&e.grades[q.id]<=q.points)n.grades[q.id]=e.grades[q.id];
  }out.exams[id]=n;
 }
 out.read=s.read.filter(id=>D.methods.some(m=>m.id===id)||D.chapters.some(c=>c.id===id));
 Object.assign(out,CustomRecords.clean(s));out.last=byId.has(s.last)?s.last:null;return out;
}
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const app=document.getElementById('app');
const rec=id=>state.records[id]||(state.records[id]={});
const cname=id=>D.chapters.find(c=>c.id===id)?.title||'综合';
const external=(url,text)=>`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${text} ↗</a>`;
function save(){if(storageWarning)return false;try{localStorage.setItem(KEY,JSON.stringify(state));if(!QA)window.AGENT_DATA_CHANGED?.();return true;}catch{storageWarning='浏览器无法保存记录，请立即导出备份。当前页面仍可练习。';toast(storageWarning);return false;}}
function toast(msg){const t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),3800);}
function route(){const [path,query='']=(location.hash.slice(1)||'home').split('?');return {path,params:new URLSearchParams(query)};}
function go(path,params={}){const query=new URLSearchParams(Object.entries(params).filter(([,v])=>v!==''));location.hash=path+(query.size?'?'+query:'');}
function math(root=app){if(window.renderMathInElement)window.renderMathInElement(root,{delimiters:[{left:'\\(',right:'\\)',display:false},{left:'\\[',right:'\\]',display:true}],throwOnError:false,trust:false});}
function heading(title,subtitle,over='MATH II'){return `<div class="eyebrow">${over}</div><h1>${title}</h1><p class="muted">${subtitle}</p>`;}
function select(name,values,value){return `<select name="${name}" aria-label="${{chapter:'章节',type:'题型',origin:'题目来源',year:'年份',filter:'复习筛选'}[name]}">${values.map(([v,t])=>`<option value="${esc(v)}" ${String(v)===String(value||'')?'selected':''}>${esc(t)}</option>`).join('')}</select>`;}
function count(ids,predicate){return ids.filter(id=>predicate(state.records[id]||{})).length;}
function statusText(r){return {wrong:'不会',shaky:'不熟',mastered:'掌握'}[r.status]||'未标记';}
function setStatus(id,status){const r=rec(id);r.status=status;r.wrong=status!=='mastered';r.last=Date.now();r.due=Date.now()+({wrong:1,shaky:3,mastered:7}[status])*day;state.last=id;save();}
function question(q,examId=null){
 const r=rec(q.id),ex=examId?state.exams[examId]:null,active=ex&&!ex.submitted,paused=active&&ex.pausedAt;
 const value=ex?ex.answers[q.id]||'':r.answer||'', reveal=ex?ex.submitted:r.revealed;
 const checked=ex?ex.submitted:r.checked;
 const correct=q.type==='choice'&&value===q.answer;
 const label=q.year?`${q.year} 年 · 第 ${q.number} 题`:`${q.origin} · ${q.mock?q.mock.slice(-1).toUpperCase()+' 卷 ':''}${q.number}`;
 return `<article class="question" id="q-${q.id}" data-q="${q.id}" ${examId?`data-exam="${examId}"`:''}>
 <div class="qmeta"><b>${label}</b><span class="chip">${{choice:'选择题',fill:'填空题',written:'解答题'}[q.type]}</span>${examId?`<span>${q.points} 分</span>`:''}<a href="#practice?chapter=${q.chapter}">${cname(q.chapter)}</a>${!active&&r.status?`<span class="chip">${statusText(r)}</span>`:''}</div>
 <div class="qbody">${q.body}</div>
 ${q.type==='choice'?`<div class="options" role="group" aria-label="选择答案">${q.options.map((o,i)=>`<label class="option"><input type="radio" name="ans-${q.id}" value="${'ABCD'[i]}" ${value==='ABCD'[i]?'checked':''} ${ex?.submitted||paused?'disabled':''}><span class="letter">${'ABCD'[i]}</span><span>${o}</span></label>`).join('')}</div>`:`<label class="field">${q.type==='written'?'我的解题思路（完整过程写在纸上）':'我的答案'}<textarea class="${q.type==='written'?'long-answer':''}" data-field="answer" placeholder="先独立完成，再查看答案" ${ex?.submitted||paused?'readonly':''}>${esc(value)}</textarea></label>`}
 ${active?'':`<div class="actions">${!ex?(q.type==='choice'?`<button class="primary" data-action="check">核对答案</button>`:`<button class="primary" data-action="reveal">${reveal?'收起答案':'查看答案'}</button>`):''}<button class="secondary" data-action="favorite" aria-pressed="${!!r.favorite}">${r.favorite?'★ 已收藏':'☆ 收藏'}</button><a class="secondary" href="#knowledge/${q.chapter}">复习知识点</a>${q.source?`<span class="source">${external(q.source,'原题与详细解析')}</span>`:''}</div>`}
 ${reveal?`<div class="answer">${checked&&q.type==='choice'?`<p class="${correct?'correct':'incorrect'}"><b>${correct?'回答正确':value?'回答错误':'未作答'}</b>${value?' · 你的答案 '+esc(value):''}</p>`:''}<b>参考答案</b><div class="qbody">${q.answerHtml||q.answer||'本题完整解答请查看来源页。'}</div>${q.explanation?`<h3>解题过程</h3><div>${q.explanation}</div>`:`<p class="muted">此题来自历年数学二试卷。${q.source?external(q.source,'查看来源页的详细解析'):''}</p>`}
 ${ex&&q.type!=='choice'?`<label class="field">本题自评分（0—${q.points} 分）<input class="score" type="number" min="0" max="${q.points}" step="1" data-field="score" value="${ex.grades[q.id]??''}" placeholder="待评"></label>`:''}
 <div class="actions"><button class="secondary" data-status="wrong">不会 · 明天再做</button><button class="secondary" data-status="shaky">不熟 · 3 天后</button><button class="secondary" data-status="mastered">掌握 · 7 天后</button></div>
 <details ${r.notes||r.cause?'open':''}><summary>记录错因与复盘</summary><label class="field">主要错因<select data-field="cause">${['','概念不清','方法没想到','计算错误','漏条件或漏分类','时间不足','猜对了'].map(s=>`<option ${r.cause===s?'selected':''}>${s||'选择错因'}</option>`).join('')}</select></label><label class="field">第一处错误、下次提醒<textarea data-field="notes" placeholder="例如：分母含参数，除之前要讨论参数为零。">${esc(r.notes||'')}</textarea></label></details></div>`:''}
 </article>`;
}
function home(){
 const records=Object.values(state.records),review=records.filter(r=>r.wrong).length,due=records.filter(r=>r.due&&r.due<=Date.now()).length;
 const recent=state.last&&byId.get(state.last);
 const next=all.find(q=>rec(q.id).due&&rec(q.id).due<=Date.now())||D.questions.find(q=>q.id==='exercise-1');
 return heading('今天，从一道题开始。','把听懂的方法，变成自己能写出的步骤。','MY STUDY DESK')+
 `<div class="stats"><div class="stat"><strong>${records.filter(r=>r.checked||r.status).length}</strong><span>已练习</span></div><div class="stat"><strong>${records.filter(r=>r.status==='mastered').length}</strong><span>已掌握</span></div><a class="stat" href="#review"><strong>${review}</strong><span>待攻克错题</span></a><a class="stat" href="#review?filter=due"><strong>${due}</strong><span>今天待复习</span></a></div>
 <div class="section-head"><h2>今日起手题</h2><a href="${recent?'#question/'+recent.id:'#practice'}">${recent?'继续上次练习':'全部专项练习'} →</a></div>${question(next)}
 <div class="section-head"><h2>把学习串起来</h2></div><div class="cards"><a class="card" href="#methods/after-class"><span class="number">01</span><h2>先知道怎么练</h2><p>课后提分、计算训练、间隔复习。每天的安排具体到动作。</p></a><a class="card" href="#knowledge"><span class="number">02</span><h2>补一个知识缺口</h2><p>12 个章节，概念、公式、起手方法与易错提醒。</p></a><a class="card" href="#mocks"><span class="number">03</span><h2>做一次完整模拟</h2><p>2 套基础巩固卷 + 1 套综合提高卷。180 分钟，150 分，交卷再复盘。</p></a></div>
 <div class="section-head"><h2>已收录内容</h2><a href="#settings">内容来源 →</a></div><p class="muted">${window.PAPERS?.questions.length||0} 道历年真题 · 12 道原创专项 · ${D.questions.filter(q=>q.mock).length} 道原创模拟 · 8 篇学习方法。最新年份可留作考前整卷。</p>`;
}
function library(kind,id){
 const collection=kind==='methods'?D.methods:D.chapters;
 const item=collection.find(x=>x.id===id);
 if(id&&!item)return empty('没有找到这篇内容。');
 if(item)return `<a href="#${kind}">← 返回${kind==='methods'?'学习方法':'知识点手册'}</a><div class="section-head"><div>${heading(item.title,item.summary,kind==='methods'?'STUDY METHODS':item.subject)}</div></div><article class="article">${item.html}<div class="notice">本站原创整理。学习方法需结合自己的基础与反馈调整；章节手册用于复习，不替代完整教材。</div><div class="actions"><button class="secondary" data-read="${item.id}">${state.read.includes(item.id)?'✓ 已读':'标记已读'}</button>${kind==='knowledge'?`<a class="primary" href="#practice?chapter=${id}">练这个章节 →</a>`:`<a class="primary" href="#practice">去练习 →</a>`}</div></article>`;
 return heading(kind==='methods'?'学习方法':'知识点手册',kind==='methods'?'你已经听完课，接下来把时间花在有效的练习和复盘上。':'高数与线代分章整理。每章都可以直接进入对应练习。')+`<div class="cards">${collection.map((x,i)=>`<a class="card" href="#${kind}/${x.id}"><span class="chip">${x.tag||x.subject}</span><h2>${x.title}</h2><p>${x.summary}</p><div class="section-head"><span class="muted">${state.read.includes(x.id)?'✓ 已读':String(i+1).padStart(2,'0')}</span><span>阅读 →</span></div></a>`).join('')}</div>`;
}
function empty(msg){return `<div class="panel empty"><h2>${msg}</h2><p>从一个章节开始，完成后标记掌握程度。</p><a class="primary" href="#practice">开始练习</a></div>`;}
function practice(params,review=false){
 const chapter=params.get('chapter')||'',type=params.get('type')||'',origin=params.get('origin')||'',year=params.get('year')||'',filter=params.get('filter')||'wrong',search=params.get('search')||'';
 let qs=all.filter(q=>review?({wrong:!!rec(q.id).wrong,favorite:!!rec(q.id).favorite,due:!!rec(q.id).due&&rec(q.id).due<=Date.now(),all:!!rec(q.id).status||!!rec(q.id).checked}[filter]):!q.mock);
 qs=qs.filter(q=>(!chapter||q.chapter===chapter)&&(!type||q.type===type)&&(!origin||(origin==='real'?!!q.year:!q.year))&&(!year||String(q.year)===year)&&(!search||[q.searchText||q.body,cname(q.chapter),q.tags?.join(' '),q.year].join(' ').toLowerCase().includes(search.toLowerCase())));
 // Default practice starts with original warm-ups, then older exams to preserve recent papers.
 if(!review)qs.sort((a,b)=>(a.year||0)-(b.year||0)||a.number-b.number);
 const per=8,pages=Math.max(1,Math.ceil(qs.length/per)),page=Math.min(pages,Math.max(1,parseInt(params.get('page'))||1));
 const base=review?'review':'practice';
 const pageUrl=p=>{const x=new URLSearchParams(params);x.set('page',p);return '#'+base+'?'+x;};
 return heading(review?'错题与收藏':'专项练习',review?'错因写具体，隔一段时间合上答案重做。':'按章节拆解难点。默认从原创热身和早年真题开始，近期卷子可留作模考。')+
 `<form class="toolbar" id="filters" data-view="${base}">${review?select('filter',[['wrong','待攻克错题'],['due','今天到期'],['favorite','收藏题目'],['all','全部练习记录']],filter):select('origin',[['','全部来源'],['real','历年真题'],['original','原创专项']],origin)}${select('chapter',[['','全部章节'],...D.chapters.map(c=>[c.id,c.title])],chapter)}${select('type',[['','全部题型'],['choice','选择'],['fill','填空'],['written','解答']],type)}${!review?select('year',[['','全部年份'],...[...new Set(all.filter(q=>q.year).map(q=>q.year))].sort((a,b)=>b-a).map(y=>[y,y+' 年'])],year):''}<input type="search" name="search" value="${esc(search)}" placeholder="搜索考点、关键词" aria-label="搜索题目"><button class="secondary" type="submit">筛选</button></form><div class="section-head"><p class="muted">共 ${qs.length} 题 · 第 ${page}/${pages} 页</p>${chapter?`<a href="#knowledge/${chapter}">回看本章知识点 →</a>`:''}</div>
 ${qs.length?qs.slice((page-1)*per,page*per).map(q=>question(q)).join(''):empty('还没有符合条件的题目')}
 ${pages>1?`<div class="pager">${page>1?`<a class="secondary" href="${pageUrl(page-1)}">上一页</a>`:''}<span>${page} / ${pages}</span>${page<pages?`<a class="secondary" href="${pageUrl(page+1)}">下一页</a>`:''}</div>`:''}`;
}
function papers(year){
 const qs=all.filter(q=>q.year===Number(year)).sort((a,b)=>a.number-b.number);
 if(year)return heading(`${esc(year)} 年数学二真题`,`${qs.length} 题 · 题目和选项可在本站练习；详细解析保留在原来源页。`)+`<a href="#papers">← 全部年份</a><div class="question-picker"><div class="picker-label">本卷题目导航 · 点击跳转</div><div class="exam-grid">${qs.map(q=>`<a href="#q-${q.id}" data-jump="q-${q.id}">${q.number}</a>`).join('')}</div></div>${qs.map(q=>question(q)).join('')}`;
 const years=[...new Set(all.filter(q=>q.year).map(q=>q.year))].sort((a,b)=>b-a);
 return heading('历年真题','整卷练习保留原始题号；按考点训练请进入专项练习。')+`<div class="notice">准备模考时，可先保留最近 2—3 年未做过的试卷。往年题型与分值结构可能不同。</div><div class="cards">${years.map(y=>{const ids=all.filter(q=>q.year===y).map(q=>q.id),done=count(ids,r=>r.checked||r.status);return `<a class="card" href="#papers/${y}"><span class="eyebrow">MATH II · ${y}</span><h2>${y} 年数学二</h2><p>${ids.length} 题 · 在线作答 · 原站解析</p><div class="progress"><span style="width:${100*done/ids.length}%"></span></div><small class="muted">已练 ${done} / ${ids.length}</small></a>`;}).join('')}</div>${window.PAPERS?.failures.length?`<div class="notice">${window.PAPERS.failures.map(x=>x.year).join('、')} 年尚未完整导入，可在 ${external('https://www.csgraduates.com/study_methods/math/math2/','来源网站')} 阅读。</div>`:''}`;
}
function mocks(id,params=new URLSearchParams()){
 const mock=D.mocks.find(m=>m.id===id),e=state.exams[id];
 if(id&&!mock)return empty('没有找到这套模拟卷');
 if(mock&&e)return exam(mock,e,params);
 return heading('模拟考场','A、B 卷巩固基础，C、D 卷增加多步推理、参数讨论与综合计算。均为本站原创，不作押题或分数预测。')+`<div class="notice">每套 10 道选择、6 道填空、6 道解答，共 150 分。建议先做 A、B 卷查缺补漏，再做 C 卷练综合；D 卷题干更集中、步骤更长，用来练压轴题取舍。</div><div class="grid2">${D.mocks.map((m,i)=>{const e=state.exams[m.id];return `<div class="card"><div class="section-head"><span class="eyebrow">PRACTICE PAPER ${String(i+1).padStart(2,'0')}</span><span class="chip">${m.level||'综合'}</span></div><h2>${m.title}</h2><p>${m.summary}</p><p>22 题 · 150 分 · 180 分钟</p><div class="actions">${e?`<a class="primary" href="#mocks/${m.id}?section=0">${e.submitted?'查看结果与解析':e.pausedAt?'继续（已暂停）':'继续考试'}</a>`:`<button class="primary" data-start="${m.id}">开始计时考试</button>`}</div></div>`;}).join('')}</div><div class="section-head"><h2>模拟之后怎么复盘</h2><a href="#methods/mock-plan">阅读方法 →</a></div><p class="muted">先区分不会、算错、没时间，再决定下一次的专项。交卷后可重做；重做会替换当前一次的作答和评分。</p>`;
}
function totals(mockId){const e=state.exams[mockId],qs=D.questions.filter(q=>q.mock===mockId);let score=0,pending=0;for(const q of qs){if(q.type==='choice')score+=e.answers[q.id]===q.answer?q.points:0;else if(Number.isFinite(e.grades[q.id]))score+=e.grades[q.id];else pending++;}return {score,pending};}
function exam(mock,e,params){
 const sections=[['choice','选择题'],['fill','填空题'],['written','解答题']],index=Math.max(0,Math.min(2,parseInt(params.get('section'))||0)),allQs=D.questions.filter(q=>q.mock===mock.id),qs=allQs.filter(q=>q.type===sections[index][0]),t=totals(mock.id),paused=!!e.pausedAt;
 const result=e.submitted?`<div class="panel"><h2 id="exam-total">${t.pending?`已确认 ${t.score} 分 · ${t.pending} 题待自评`:`总分 ${t.score} / 150（含自评分）`}</h2><p class="muted">选择题自动判分。填空按答案核对，大题依据过程分自评；本站评分要点仅供练习。</p><button class="secondary" data-restart="${mock.id}">重做这套卷</button></div>`:'';
 const bar=e.submitted?'':`<div class="exam-bar"><span>剩余时间 <b id="timer">${paused?'已暂停':'--:--:--'}</b></span><span id="answered">${Object.values(e.answers).filter(x=>x.trim()).length} / 22 已作答</span><div class="actions"><button class="secondary" data-exit-exam="${mock.id}">返回并暂停</button><button class="secondary" data-pause="${mock.id}">${paused?'继续考试':'暂停'}</button><button class="secondary" data-finish="${mock.id}">交卷并查看解析</button></div></div>`;
 const controls=`<div class="exam-controls">${bar}<div class="exam-section-tabs">${sections.map(([,label],i)=>`<a href="#mocks/${mock.id}?section=${i}" ${i===index?'aria-current="page"':''}>${label}</a>`).join('')}</div><div class="exam-grid">${qs.map(q=>`<a data-jump="q-${q.id}" href="#q-${q.id}" class="${e.answers[q.id]?'done':''}">${q.number}</a>`).join('')}</div></div>`;
 const stepper=`<div class="exam-stepper">${index?`<a class="secondary" href="#mocks/${mock.id}?section=${index-1}">← 上一部分</a>`:'<span></span>'}<span>第 ${index+1} / ${sections.length} 部分</span>${index<sections.length-1?`<a class="primary" href="#mocks/${mock.id}?section=${index+1}">下一部分 →</a>`:e.submitted?'<a class="secondary" href="#mocks">返回模拟考场</a>':`<button class="secondary" data-exit-exam="${mock.id}">返回并暂停</button>`}</div>`;
 return heading(mock.title,e.submitted?'已交卷。先按评分要点自评，再标记需要重做的题。':paused?'考试已暂停，答案已保存；点击“继续考试”后恢复计时。':'在纸上写完整过程，网页保留答案与思路。')+result+`<div class="exam-page">${controls}${qs.map(q=>question(q,mock.id)).join('')}${stepper}</div>`;
}
function startExam(id){const m=D.mocks.find(m=>m.id===id);if(!m)return false;const start=Date.now();state.exams[id]={start,end:start+m.minutes*60000,submitted:false,answers:{},grades:{}};save();return true;}
function togglePause(id){const e=state.exams[id];if(!e||e.submitted)return;if(e.pausedAt){e.end+=Date.now()-e.pausedAt;delete e.pausedAt;toast('考试已继续');}else{if(Date.now()>=e.end){finish(id,true);return;}e.pausedAt=Date.now();toast('考试已暂停，答案已保存');}save();render(true);}
function finish(id,auto=false){const e=state.exams[id];if(!e||e.submitted)return;if(!auto&&!confirm(`确认交卷？已作答 ${Object.values(e.answers).filter(x=>x.trim()).length}/22 题。交卷后进入解析与自评。`))return;e.submitted=true;delete e.pausedAt;for(const q of D.questions.filter(q=>q.mock===id&&q.type==='choice')){const r=rec(q.id);r.answer=e.answers[q.id]||'';r.checked=true;r.correct=r.answer===q.answer;r.wrong=!r.correct;if(r.wrong){r.status='wrong';r.due=Date.now()+day;}}save();render(true);if(auto)toast('考试时间结束，已自动交卷。');}
function tick(){for(const [id,e] of Object.entries(state.exams))if(!e.submitted&&!e.pausedAt&&Date.now()>=e.end)finish(id,true);const {path}=route(),id=path.split('/')[1],e=state.exams[id],node=document.getElementById('timer');if(node&&e&&!e.pausedAt){const t=Math.max(0,Math.floor((e.end-Date.now())/1000));node.textContent=[Math.floor(t/3600),Math.floor(t/60)%60,t%60].map(n=>String(n).padStart(2,'0')).join(':');}}
function settings(){return heading('数据与来源','学习记录保存在当前浏览器。换设备或清理浏览器前，请导出备份。')+`<div class="grid2"><section class="panel"><h2>学习记录备份</h2><p>包含作答、错因、收藏、掌握程度、已读文章与模拟进度。电脑与平板之间可通过备份文件手动迁移，不会自动同步。</p><div class="actions"><button class="primary" data-action="export">导出学习记录</button><label class="secondary" for="import">导入备份</label><input class="sr-only" id="import" type="file" accept=".json,application/json"></div></section><section class="panel"><h2>个人使用</h2><p>没有注册和付费功能，也没有统计脚本。网站和学习记录不会主动上传。访问来源页及原题附图需要联网。</p><p class="muted">建议每周备份一次。清理网站数据、换浏览器或切换网址后，原记录不会自动出现。</p></section></div><section class="panel" style="margin-top:20px"><h2>内容说明</h2><div class="link-row"><div><b>历年真题 · ${window.PAPERS?.questions.length||0} 题</b><p class="muted">题干、选项与选择题答案整理自公开试卷页面。保留逐题来源。第三方详细解题文章在原站阅读，部分填空答案可直接查看。</p></div>${external('https://www.csgraduates.com/study_methods/math/math2/','计算机考研杂货铺')}</div><div class="link-row"><div><b>原创学习内容</b><p class="muted">12 章复习手册、8 篇学习方法、12 道专项练习与 4 套原创模拟卷。A、B 卷定位基础巩固，C、D 卷定位综合提高；不是张宇、李林等教师试卷，也未做真实难度标定。</p></div></div><div class="link-row"><div><b>参考学习入口</b><p>${external('https://www.csgraduates.com/study_methods/talk/methodology/','杂货铺复习方法论')} · ${external('https://zhentiqiang.com/kaoyan/math','真题墙')} · ${external('https://www.icourse163.org/','中国大学 MOOC')}</p></div></div><p class="muted">题目整理日期：${esc(window.PAPERS?.retrieved||'未加载')}。原题答案可能有勘误，疑问处请对照原卷与可信解析。真题为历史材料，不等同于当年大纲。</p></section>`;}
function render(keepScroll=false){
 const top=scrollY,{path,params}=route(),[kind,id]=path.split('/');
 const labels={home:'学习概览',methods:'学习方法',knowledge:'知识点手册',practice:'专项练习',papers:'历年真题',mocks:'模拟考场',review:'错题与收藏',custom:'自定义记录',settings:'数据与来源',question:'单题练习'};
 document.getElementById('crumb').textContent=labels[kind]||'学习空间';document.title=(labels[kind]||'学习空间')+' · 数学二 · 考研研习室';
 document.querySelectorAll('#nav a').forEach(a=>{a.classList.toggle('active',a.hash==='#'+kind);if(a.hash==='#'+kind)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
 let html='';
 if(kind==='home')html=home();else if(kind==='methods'||kind==='knowledge')html=library(kind,id);else if(kind==='practice'||kind==='review')html=practice(params,kind==='review');else if(kind==='papers')html=papers(id);else if(kind==='mocks')html=mocks(id,params);else if(kind==='custom')html=CustomRecords.render(state,heading,'数学');else if(kind==='settings')html=settings();else if(kind==='question'&&byId.has(id)){const q=byId.get(id);html=q.mock&&!state.exams[q.mock]?.submitted?mocks():heading('单题练习',cname(q.chapter))+question(q);}else html=empty('这个页面不存在');
 app.innerHTML=(storageWarning?`<div class="notice">${esc(storageWarning)}</div>`:'')+html;math();if(keepScroll)scrollTo(0,top);else scrollTo(0,0);tick();
}
app.addEventListener('submit',ev=>{const form=ev.target;if(form.dataset.customForm){ev.preventDefault();const msg=CustomRecords.submit(form,state);if(msg){save();render();toast(msg);}return;}if(form.id!=='filters')return;ev.preventDefault();go(form.dataset.view,Object.fromEntries(new FormData(form)));});
app.addEventListener('click',ev=>{
 const b=ev.target.closest('button,a[data-jump]');if(!b)return;
 if(b.dataset.customDelete){if(CustomRecords.remove(b,state)){save();render(true);toast('已删除自定义记录');}return;}
 if(b.dataset.jump){ev.preventDefault();document.getElementById(b.dataset.jump)?.scrollIntoView({behavior:'smooth'});return;}
 if(b.dataset.start){const id=b.dataset.start;if(!startExam(id))return;go('mocks/'+id,{section:0});return;}
 if(b.dataset.exitExam){const e=state.exams[b.dataset.exitExam];if(e&&!e.submitted&&!e.pausedAt)e.pausedAt=Date.now();save();go('mocks');toast('已暂停并保存，可稍后继续');return;}
 if(b.dataset.pause){togglePause(b.dataset.pause);return;}
 if(b.dataset.finish){finish(b.dataset.finish);return;}
 if(b.dataset.restart){const id=b.dataset.restart;if(!confirm('重做会替换这套卷当前一次的作答和评分；学习错题记录不会删除。需要保留时请先导出备份。确认重做？'))return;startExam(id);go('mocks/'+id,{section:0});render();toast('已开始新的作答');return;}
 if(b.dataset.read){state.read=state.read.includes(b.dataset.read)?state.read.filter(x=>x!==b.dataset.read):[...state.read,b.dataset.read];save();render(true);return;}
 if(b.dataset.action==='export'){
  const raw=recoveryRaw;
  const blob=new Blob([raw||JSON.stringify(state,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`数二学习记录-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('备份已导出');return;
 }
 const card=b.closest('[data-q]');if(!card)return;const q=byId.get(card.dataset.q),r=rec(q.id);
 if(b.dataset.status){setStatus(q.id,b.dataset.status);toast('已记录，下次复习日期已更新');}
 else if(b.dataset.action==='favorite'){r.favorite=!r.favorite;save();}
 else if(b.dataset.action==='reveal'){r.revealed=!r.revealed;state.last=q.id;save();}
 else if(b.dataset.action==='check'){
  if(!r.answer){toast('先选择一个答案');return;}r.checked=true;r.correct=r.answer===q.answer;r.revealed=true;r.last=Date.now();state.last=q.id;
  if(!r.correct){r.wrong=true;r.status='wrong';r.due=Date.now()+day;}save();
 }
 // Only replace this card so ongoing text inputs elsewhere are preserved.
 const box=document.createElement('div');box.innerHTML=question(q,card.dataset.exam||null);math(box);card.replaceWith(box.firstElementChild);
});
app.addEventListener('input',ev=>{
 const input=ev.target,card=input.closest('[data-q]');if(!card||input.type==='file')return;
 const q=byId.get(card.dataset.q),r=rec(q.id),examId=card.dataset.exam,e=state.exams[examId];
 if(e?.pausedAt)return;
 if(e&&!e.submitted&&Date.now()>=e.end){finish(examId,true);return;}
 if(input.type==='radio'||input.dataset.field==='answer'){
  if(e){if(e.submitted)return;e.answers[q.id]=input.value;const a=document.getElementById('answered');if(a)a.textContent=Object.values(e.answers).filter(x=>x.trim()).length+' / 22 已作答';const nav=app.querySelector(`[data-jump="q-${q.id}"]`);nav?.classList.toggle('done',!!input.value.trim());}
  else{r.answer=input.value;r.checked=false;state.last=q.id;}
 }else if(input.dataset.field==='notes')r.notes=input.value;
 else if(input.dataset.field==='cause')r.cause=input.value;
 else if(input.dataset.field==='score'&&e?.submitted){const v=Number(input.value);if(input.value===''||!Number.isInteger(v)||v<0||v>q.points){delete e.grades[q.id];input.setCustomValidity(input.value===''?'':`请输入 0—${q.points} 的整数`);}else{input.setCustomValidity('');e.grades[q.id]=v;r.checked=true;r.answer=e.answers[q.id]||'';r.wrong=v<q.points;if(r.wrong){r.status='wrong';r.due=Date.now()+day;}}const t=totals(examId);document.getElementById('exam-total').textContent=t.pending?`已确认 ${t.score} 分 · ${t.pending} 题待自评`:`总分 ${t.score} / 150（含自评分）`;}
 save();
});
app.addEventListener('change',async ev=>{
 if(ev.target.id!=='import')return;const file=ev.target.files[0];if(!file)return;
 try{if(file.size>6*1024*1024)throw Error('备份超过 6 MB，请检查文件');const candidate=validate(JSON.parse(await file.text()));if(!confirm(`将恢复 ${Object.keys(candidate.records).length} 道题的记录，并替换本浏览器当前记录。确定导入？`))return;state=candidate;storageWarning='';recoveryRaw=null;if(save()){toast('备份已恢复');render();}}catch(e){toast('导入失败：'+e.message);}finally{ev.target.value='';}
});
window.addEventListener('hashchange',()=>render());
window.addEventListener('pagehide',save);
timer=setInterval(tick,1000);render();
// Same navigation as the visible interface; no access to answers before a mock is submitted.
const context=document.modelContext;
if(context?.registerTool){
 const lifecycle=new AbortController();
 for(const tool of [
  {name:'read_math2_progress',description:'Read local counts of practiced, mastered and wrong questions.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute(input){if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length)throw Error('Expected an empty object');const rs=Object.values(state.records);return{practiced:rs.filter(r=>r.checked||r.status).length,mastered:rs.filter(r=>r.status==='mastered').length,wrong:rs.filter(r=>r.wrong).length};}},
  {name:'navigate_math2_chapter',description:'Open a mathematics II chapter or its practice questions. Does not grade or submit.',inputSchema:{type:'object',properties:{chapter:{type:'string',enum:D.chapters.map(c=>c.id)},practice:{type:'boolean'}},required:['chapter'],additionalProperties:false},execute(input){if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['chapter','practice'].includes(k))||!D.chapters.some(c=>c.id===input.chapter)||('practice'in input&&typeof input.practice!=='boolean'))throw Error('Invalid chapter or practice');if(input.practice)go('practice',{chapter:input.chapter});else go('knowledge/'+input.chapter);render();return{chapter:input.chapter,view:input.practice?'practice':'knowledge'};}}
 ])try{Promise.resolve(context.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}
 window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
}
});
