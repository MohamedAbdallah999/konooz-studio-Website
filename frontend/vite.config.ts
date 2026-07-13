import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import {VitePWA} from 'vite-plugin-pwa';

export default defineConfig({
  plugins:[react(),tailwind(),VitePWA({
    registerType:'autoUpdate',
    includeAssets:['brand/*.png','brand/*.jpg'],
    manifest:{
      name:'Konooz - The Style You Love',
      short_name:'Konooz',
      description:'Offline-first dress inventory and sales',
      theme_color:'#171511',
      background_color:'#F7F1E6',
      display:'standalone',
      start_url:'/',
      icons:[{src:'/brand/konooz-square.jpg',sizes:'640x640',type:'image/jpeg',purpose:'any maskable'}],
    },
    workbox:{navigateFallback:'/index.html'},
  })],
});
