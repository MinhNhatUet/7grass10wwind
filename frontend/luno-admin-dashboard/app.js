const dateBtn=document.getElementById("dateBtn");
const calendar=document.getElementById("calendar");
dateBtn.addEventListener("click",()=>calendar.classList.toggle("open"));
document.addEventListener("click",e=>{
  if(!e.target.closest(".calendar")&&!e.target.closest("#dateBtn")) calendar.classList.remove("open");
});
function makeMonth(id,year,month){
  const el=document.getElementById(id);
  const first=new Date(year,month,1).getDay();
  const count=new Date(year,month+1,0).getDate();
  let html="";
  for(let i=0;i<first;i++) html+="<span></span>";
  for(let d=1;d<=count;d++){
    html+=`<span class="${year===2026&&month===8&&d===26?"selected":""}">${d}</span>`;
  }
  el.innerHTML=html;
}
makeMonth("sep",2026,8);
makeMonth("oct",2026,9);
document.querySelectorAll(".days").forEach(box=>{
  box.addEventListener("click",e=>{
    if(e.target.tagName==="SPAN"&&e.target.textContent){
      document.querySelectorAll(".days .selected").forEach(x=>x.classList.remove("selected"));
      e.target.classList.add("selected");
    }
  });
});
