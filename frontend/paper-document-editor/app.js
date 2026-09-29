const state={zoom:1,selected:null};
const canvas=document.getElementById("canvas");
const appScreen=document.getElementById("appScreen");
const zoomLabel=document.getElementById("zoomLabel");
const codePanel=document.getElementById("codePanel");

function setZoom(value){
  state.zoom=Math.max(.5,Math.min(1.5,value));
  appScreen.style.transform=`scale(${state.zoom})`;
  appScreen.style.transformOrigin="center center";
  zoomLabel.textContent=Math.round(state.zoom*100)+"%";
}
document.getElementById("zoomIn").onclick=()=>setZoom(state.zoom+.1);
document.getElementById("zoomOut").onclick=()=>setZoom(state.zoom-.1);

document.querySelectorAll(".tool").forEach(btn=>{
  btn.addEventListener("click",()=>{
    document.querySelectorAll(".tool").forEach(x=>x.classList.remove("active"));
    btn.classList.add("active");
    const tool=btn.dataset.tool;
    if(tool==="text"){
      const el=document.createElement("div");
      el.className="editable";
      el.contentEditable="true";
      el.textContent="New text";
      el.style.cssText="font:400 28px Manrope; margin-top:18px; color:#181818";
      document.querySelector(".screen-content").appendChild(el);
      el.focus();
      selectElement(el);
    }
  });
});

function selectElement(el){
  state.selected=el;
  document.querySelectorAll(".editable").forEach(x=>x.classList.remove("selected"));
  el.classList.add("selected");
  const cs=getComputedStyle(el);
  document.getElementById("sizeInput").value=parseFloat(cs.fontSize)||16;
  document.getElementById("lineInput").value=parseFloat(cs.lineHeight)||1.2;
  document.getElementById("fontInput").value=cs.fontFamily.split(",")[0].replaceAll('"',"");
}
document.querySelectorAll(".editable").forEach(el=>{
  el.addEventListener("click",e=>{e.stopPropagation();selectElement(el)});
});
document.getElementById("canvas").addEventListener("click",e=>{
  if(e.target===canvas||e.target===appScreen) {
    document.querySelectorAll(".editable").forEach(x=>x.classList.remove("selected"));
    state.selected=null;
  }
});

const bind=(id,fn)=>document.getElementById(id).addEventListener("input",e=>{
  if(state.selected) fn(state.selected,e.target.value);
});
bind("sizeInput",(el,v)=>el.style.fontSize=v+"px");
bind("lineInput",(el,v)=>el.style.lineHeight=v);
bind("fontInput",(el,v)=>el.style.fontFamily=`${v}, Inter, sans-serif`);
document.getElementById("weightInput").addEventListener("change",e=>{if(state.selected)state.selected.style.fontWeight=e.target.value});
document.getElementById("fillInput").addEventListener("input",e=>{
  if(state.selected) state.selected.style.color=e.target.value;
});
const radius=document.getElementById("radiusInput");
radius.addEventListener("input",e=>{
  document.getElementById("radiusOut").value=e.target.value;
  if(state.selected) state.selected.style.borderRadius=e.target.value+"px";
});

document.getElementById("codeToggle").onclick=()=>codePanel.classList.toggle("open");
document.getElementById("codeClose").onclick=()=>codePanel.classList.remove("open");
document.getElementById("codeSend").onclick=()=>{
  const input=document.getElementById("codeInput");
  if(!input.value.trim())return;
  const line=document.createElement("div");
  line.className="code-line";
  line.innerHTML='<span class="green">›</span> '+input.value.replace(/[<>&]/g,c=>({"<":"&lt;",">":"&gt;","&":"&amp;"}[c]));
  document.querySelector(".code-body").appendChild(line);
  input.value="";
};
document.getElementById("codeInput").addEventListener("keydown",e=>{if(e.key==="Enter")document.getElementById("codeSend").click()});

document.getElementById("xInput").addEventListener("input",e=>{
  if(state.selected)state.selected.dataset.x=e.target.value;
});
document.getElementById("yInput").addEventListener("input",e=>{
  if(state.selected)state.selected.dataset.y=e.target.value;
});
document.getElementById("wInput").addEventListener("input",e=>{
  if(state.selected)state.selected.style.width=e.target.value+"px";
});
document.getElementById("hInput").addEventListener("input",e=>{
  if(state.selected)state.selected.style.height=e.target.value+"px";
});

selectElement(document.querySelector('[data-id="heading"]'));
