import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const repository=fileURLToPath(new URL('../../',import.meta.url));
export default {
 root:resolve(repository,'tools/cinematic'),publicDir:false,
 server:{host:'127.0.0.1',strictPort:true,fs:{allow:[repository]}},
 plugins:[{name:'local-cinematic-assets',configureServer(server){
  server.middlewares.use((request,_response,next)=>{
   if(request.url?.startsWith('/cinematic/'))request.url=`/@fs${resolve(repository,'apps/web/public')}${request.url}`;
   next();
  });
 }}],
};
