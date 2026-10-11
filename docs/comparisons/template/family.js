(function(){"use strict";
var D=JSON.parse(document.getElementById("data").textContent);
var ROWS=D.rows,B=D.lanes,COMP=B.slice(1);
var CONF={two:"Two vendors document the category",vendor:"One vendor's own claim"};
var RAW={documented:"Documented",integration:"Integration","not verified":"Not found","not natively offered":"Not offered",retired:"Retired"};
function esc(s){return String(s==null?"":s).replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c];});}
function el(id){return document.getElementById(id);}
function icon(st){
  if(st==="full")return '<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="6" fill="currentColor"/></svg>';
  if(st==="partial")return '<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="5.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M7 1.5a5.5 5.5 0 0 1 0 11z" fill="currentColor"/></svg>';
  return '<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><circle cx="7" cy="7" r="5.5" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>';}
function word(p){return p[3]?RAW[p[3]]||p[3]:p[0]==="full"?"Full":p[0]==="partial"?"Partial":"None";}
function val(s){return s==="full"?1:s==="partial"?.5:0;}
function fmt(n){return (Math.round(n*10)/10).toString();}
function scoreOf(k){var pts=0;ROWS.forEach(function(r){pts+=val(r[k][0]);});return {pts:pts,n:ROWS.length,pct:(100*pts/ROWS.length).toFixed(1)};}
function tags(list){return (list||[]).map(function(t){var x=D.src[t];return x?'<a class="src" href="'+esc(x.url)+'" title="'+esc(x.name)+'" rel="noopener" target="_blank">'+esc(t)+'</a>':'';}).join(" ");}
function cell(b,r){var p=r[b[0]];
  return '<td class="'+b[0]+'" data-label="'+esc(b[1])+'"><span class="st" style="color:'+(p[0]==="none"?"var(--faint)":b[2])+'">'+icon(p[0])+esc(word(p))+'</span><p class="ev">'+esc(p[1])+'</p>'+(Array.isArray(p[2])&&p[2].length?'<div>'+tags(p[2])+'</div>':'')+'</td>';}
function best(r){var m=0;COMP.forEach(function(b){m=Math.max(m,val(r[b[0]][0]));});return m;}
var S={};
(function(){
  var ruler=el("ruler"),lanes={k:el("lane-k")};
  B.forEach(function(b){lanes[b[0]]=el("lane-"+b[0]);});
  D.cats.forEach(function(cat,ci){
    var rows=ROWS.filter(function(r){return r.cat===ci;});if(!rows.length)return;
    var rb=document.createElement("div");rb.className="blk";rb.style.flex=rows.length;rb.textContent=D.short[ci]+" · "+rows.length;rb.title=cat;ruler.appendChild(rb);
    Object.keys(lanes).forEach(function(k){
      var bk=document.createElement("div");bk.className="blk";bk.style.flex=rows.length;
      rows.forEach(function(r){var s=document.createElement("a");s.href="#"+r.id;
        if(k==="k"){s.className="seg k-"+r.conf;s.title=r.n+". "+r.f+": "+CONF[r.conf];}
        else{s.className="seg "+k+"-"+r[k][0];s.title=r.n+". "+r.f+": "+word(r[k]);}
        s.setAttribute("aria-label",s.title);bk.appendChild(s);});
      lanes[k].appendChild(bk);});
  });
  B.forEach(function(b){var s=S[b[0]]=scoreOf(b[0]);
    el("sc-"+b[0]).textContent=fmt(s.pts)+" of "+s.n+" capabilities";
    el("big-"+b[0]).innerHTML=s.pct+"%<small>"+fmt(s.pts)+" of "+s.n+"</small>";
    el("vp-"+b[0]).textContent=D.vp[b[0]]||"";});
  var none=ROWS.filter(function(r){return r.m[0]==="none";});
  var order=COMP.map(function(b){return b[1]+" "+S[b[0]].pct+"%";}).join(", ");
  el("bottomline").textContent="Over the "+S.m.n+" researched rows, "+B[0][1]+" covers "+S.m.pct+" percent ("+fmt(S.m.pts)+" points) on executed local acceptance. From their own documentation, read as lower bounds: "+order+". "+B[0][1]+" has no version yet of "+none.length+(none.length===1?" row":" rows")+(none.length?": "+none.map(function(r){return r.n+". "+r.f;}).join("; ")+".":".");
  var lead=ROWS.filter(function(r){return val(r.m[0])>best(r);}).length,behind=ROWS.filter(function(r){return best(r)>val(r.m[0]);}).length;
  el("exceeds-lede").textContent=B[0][1]+" scores above all of the other products on "+lead+(lead===1?" row":" rows")+"; at least one of them scores above "+B[0][1]+" on "+behind+(behind===1?" row":" rows")+". Ties at Full are the common case: the four document most of what "+B[0][1]+" accepts.";
})();
(function(){
  var tb=el("mx"),groups=[],rows=[];
  D.cats.forEach(function(cat,ci){
    var list=ROWS.filter(function(r){return r.cat===ci;});if(!list.length)return;
    tb.insertAdjacentHTML("beforeend",'<tr class="grp"><th colspan="'+(B.length+2)+'" scope="colgroup">'+esc(cat)+'</th></tr>');
    groups.push({node:tb.lastElementChild,cat:ci});
    list.forEach(function(r){
      tb.insertAdjacentHTML("beforeend",'<tr class="row" id="'+esc(r.id)+'"><td class="f">'+esc(r.n+". "+r.f)+'<div class="kv">'+esc(r.id+" · "+r.p)+'</div></td><td class="k" data-label="Target">'+tags(r.src)+'<div class="kv">'+CONF[r.conf]+'</div><p class="ev">'+esc(r.kn)+'</p></td>'+B.map(function(b){return cell(b,r);}).join("")+'</tr>');
      rows.push({node:tb.lastElementChild,r:r});});
  });
  function apply(f){var shown=0;
    rows.forEach(function(x){var r=x.r,ok=f==="gaps"?r.m[0]!=="full":f==="lead"?val(r.m[0])>best(r):f==="behind"?best(r)>val(r.m[0]):f==="new"?r.added===D.version||r.added===D.prev:true;
      if(x.node.hidden===ok)x.node.hidden=!ok;if(ok)shown++;});
    groups.forEach(function(g){var any=rows.some(function(x){return x.r.cat===g.cat&&!x.node.hidden;});if(g.node.hidden===any)g.node.hidden=!any;});
    el("rowcount").textContent=shown+" of "+ROWS.length+" rows";}
  document.querySelectorAll(".seg-ctl button").forEach(function(btn){btn.addEventListener("click",function(){
    document.querySelectorAll(".seg-ctl button").forEach(function(x){x.setAttribute("aria-pressed",String(x===btn));});apply(btn.getAttribute("data-f"));});});
  apply("all");
})();
(function(){
  var cx=el("cx");D.changes.forEach(function(r){cx.insertAdjacentHTML("beforeend",'<tr class="row"><td class="f">'+esc(r[0])+'</td><td class="k" data-label="v'+esc(D.prev)+'"><p class="ev" style="margin:0">'+esc(r[1])+'</p></td><td class="m" data-label="v'+esc(D.version)+'"><p class="ev" style="margin:0">'+esc(r[2])+'</p></td></tr>');});
  var hx=el("hx");D.history.forEach(function(h){hx.insertAdjacentHTML("beforeend",'<tr class="row'+(h.version===D.version?' now':'')+'"><td class="f">v'+esc(h.version)+'</td><td data-label="Date">'+esc(h.date)+'</td><td data-label="Rows">'+h.n+'</td><td data-label="Full">'+h.full+'</td><td data-label="Partial">'+h.partial+'</td><td data-label="None">'+h.none+'</td><td class="m" data-label="Score"><b>'+fmt(h.pts)+'</b> ('+(100*h.pts/h.n).toFixed(1)+'%)</td><td data-label="What moved"><p class="ev" style="margin:0">'+esc(h.note)+'</p></td></tr>');});
  var eb=el("ex-b");ROWS.filter(function(r){return best(r)>val(r.m[0]);}).forEach(function(r){eb.insertAdjacentHTML("beforeend",'<tr class="row"><td class="f">'+esc(r.n+". "+r.f)+'</td>'+B.map(function(b){return cell(b,r);}).join("")+'</tr>');});
  var el2=el("ex-m");ROWS.filter(function(r){return val(r.m[0])>best(r);}).forEach(function(r){el2.insertAdjacentHTML("beforeend",'<tr class="row"><td class="f">'+esc(r.n+". "+r.f)+'</td>'+B.map(function(b){return cell(b,r);}).join("")+'</tr>');});
  var e3=el("ex3");D.platform.forEach(function(row){e3.insertAdjacentHTML("beforeend",'<tr class="row"><td class="f">'+esc(row[0])+'</td>'+B.map(function(b,i){return '<td class="'+b[0]+'" data-label="'+esc(b[1])+'"><p class="ev" style="margin:0">'+esc(row[i+1])+'</p></td>';}).join("")+'</tr>');});
  var fc=el("facts");D.claims.forEach(function(c){fc.insertAdjacentHTML("beforeend",'<div class="fact"><h3>'+esc(c[0])+'</h3><p>'+esc(c[1])+'</p>'+(c[2]&&c[2].length?'<span class="flag">Sources: '+tags(c[2])+'</span>':'')+'</div>');});
  var ps=el("psfacts"),gap=ROWS.filter(function(r){return B.every(function(b){return r[b[0]][0]==="none";});});
  if(!gap.length)ps.insertAdjacentHTML("beforeend",'<li class="imp"><div><h4>Every row is covered by at least one product here</h4></div></li>');
  gap.forEach(function(r){ps.insertAdjacentHTML("beforeend",'<li class="imp"><span class="pri low">'+esc(r.p)+'</span><div><h4>'+esc(r.n+". "+r.f)+'</h4><p>'+esc(r.kn)+'</p></div></li>');});
  var part=ROWS.filter(function(r){return r.m[0]!=="full";}),ip=el("imp-ps");
  el("n-high").textContent=ROWS.filter(function(r){return r.m[0]==="none";}).length;
  el("n-med").textContent=ROWS.filter(function(r){return r.m[0]==="partial";}).length;
  el("n-done").textContent=D.closed.length;
  part.forEach(function(r){var better=COMP.filter(function(b){return val(r[b[0]][0])>val(r.m[0]);}).map(function(b){return b[1];});
    ip.insertAdjacentHTML("beforeend",'<li class="imp"><span class="pri '+(r.m[0]==="none"?"high":"med")+'">'+(r.m[0]==="none"?"None":"Partial")+'</span><div><h4>'+esc(r.n+". "+r.f)+'</h4><p>'+esc(r.m[2]||r.m[1])+'</p>'+(better.length?'<span class="where">Ahead here: '+esc(better.join(", "))+'</span>':'')+'</div></li>');});
  var cd=el("imp-done");if(!D.closed.length)cd.insertAdjacentHTML("beforeend",'<li class="imp"><span class="pri done">None</span><div><h4>No row changed grade since v'+esc(D.prev)+'</h4><p>'+esc(D.closedNote)+'</p></div></li>');
  D.closed.forEach(function(c){cd.insertAdjacentHTML("beforeend",'<li class="imp"><span class="pri done">Closed</span><div><h4>'+esc(c[0])+'</h4><p>'+esc(c[1])+'</p></div></li>');});
  var sl=el("srclist");Object.keys(D.src).forEach(function(t){var s=D.src[t];sl.insertAdjacentHTML("beforeend",'<li><b><a href="'+esc(s.url)+'" rel="noopener" target="_blank">'+esc(t+" · "+s.name)+'</a></b>, '+esc(s.by)+', fetched '+esc(s.date)+'.</li>');});
})();
(function(){
  function post(){try{parent.postMessage({fa:"h",id:"web",h:Math.ceil(document.documentElement.getBoundingClientRect().height)},"*");}catch(e){}}
  if(window.ResizeObserver)new ResizeObserver(post).observe(document.documentElement);
  window.addEventListener("load",function(){post();try{parent.postMessage({fa:"ready",id:"web"},"*");}catch(e){}});
  window.addEventListener("message",function(e){var d=e.data;if(!d||d.fa!=="theme")return;if(d.t)document.documentElement.setAttribute("data-theme",d.t);else document.documentElement.removeAttribute("data-theme");});
  post();
})();
})();
