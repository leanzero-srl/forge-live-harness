// Test-only executable substitution below the real observer and real installed
// Playwright launcher. The runtime observer itself has no substitution seam.
const cp=require('node:child_process');
const spawn=cp.spawn;
cp.spawn=function(file,args,options){
 if(file==='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'){
  const script=`const c=require('node:child_process').spawn(process.execPath,['-e','setTimeout(()=>process.exit(0),500)'],{detached:true,stdio:['ignore','inherit','inherit']});c.unref();setTimeout(()=>process.exit(0),30);`;
  return Reflect.apply(spawn,this,[process.execPath,['-e',script],options]);
 }
 return Reflect.apply(spawn,this,arguments);
};
