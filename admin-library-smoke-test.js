const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const {once}=require('node:events');
const {WEB_FILES}=require('./scripts/build');
const fixture=require('./tests/catalog-fixtures');
app.setName('Recall Library Publishing Smoke Test');
app.setPath('userData',path.join(app.getPath('temp'),`recall-library-smoke-${process.pid}`));
app.on('window-all-closed',()=>{});
app.whenReady().then(async()=>{
  let server;const windows=[];
  try{
    const allowed=new Set([...WEB_FILES,'service-worker.js']);
    server=http.createServer((request,response)=>{
      const name=new URL(request.url,'http://localhost').pathname.slice(1)||'index.html';
      if(!allowed.has(name)){response.writeHead(404);response.end();return;}
      response.writeHead(200,{'Content-Type':name.endsWith('.js')?'application/javascript':name.endsWith('.css')?'text/css':'text/html'});
      response.end(fs.readFileSync(path.join(__dirname,'dist-web',name)));
    });server.listen(0,'127.0.0.1');await once(server,'listening');
    for(const [platform,width] of [['electron',1100],['web',1100],['web',390]]){
      const window=new BrowserWindow({show:false,width,height:850,webPreferences:{contextIsolation:true,nodeIntegration:false,partition:`recall-publish-${platform}-${width}-${process.pid}`}});windows.push(window);
      window.webContents.session.webRequest.onBeforeRequest((details,callback)=>callback({cancel:!details.url.startsWith('file://')&&!details.url.startsWith('http://127.0.0.1:')&&!details.url.startsWith('blob:')}));
      if(platform==='electron')await window.loadFile(path.join(__dirname,'index.html'));else await window.loadURL(`http://127.0.0.1:${server.address().port}/`);
      await window.webContents.executeJavaScript(`window.publicationFixtures=${JSON.stringify({metadata:fixture.metadata(),source:fixture.source(),USER:fixture.USER})}`);
      console.log(`${platform} ${width}px: `+await window.webContents.executeJavaScript(fs.readFileSync(path.join(__dirname,'tests/admin-library-browser.js'),'utf8')));
      window.destroy();
    }
  }catch(error){console.error(error.stack||error);process.exitCode=1;}
  finally{for(const window of windows)if(!window.isDestroyed())window.destroy();server?.close();app.exit(process.exitCode||0);}
});
