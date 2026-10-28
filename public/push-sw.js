// Notificações do Investindo!, carregado dentro do service worker gerado pelo
// vite-plugin-pwa (workbox.importScripts em vite.config.ts). A função
// "alertas" manda { titulo, corpo, url, tag }.

self.addEventListener('push', (evento) => {
  let dados = {};
  try {
    dados = evento.data ? evento.data.json() : {};
  } catch {
    dados = { corpo: evento.data ? evento.data.text() : '' };
  }
  const titulo = dados.titulo || 'Investindo!';
  evento.waitUntil(
    self.registration.showNotification(titulo, {
      body: dados.corpo || '',
      icon: '/marca/icone-192.png',
      badge: '/marca/icone-192.png',
      tag: dados.tag || 'investindo',
      lang: 'pt-BR',
      data: { url: dados.url || '/' },
    }),
  );
});

// Toque na notificação: volta para uma aba aberta do app ou abre uma nova.
self.addEventListener('notificationclick', (evento) => {
  evento.notification.close();
  const destino = new URL(evento.notification.data?.url || '/', self.location.origin).href;
  evento.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((abertas) => {
      for (const c of abertas) {
        if (new URL(c.url).origin === self.location.origin && 'focus' in c) {
          return c.focus().then((janela) => (janela && 'navigate' in janela ? janela.navigate(destino) : undefined));
        }
      }
      return self.clients.openWindow(destino);
    }),
  );
});
