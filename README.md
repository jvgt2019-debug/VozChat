# VozChat

Projeto com:

- `chamada-7.html` — cliente WebRTC.
- `server.js` — servidor HTTP + WebSocket de sinalização.
- `package.json` — dependência `ws`.

## Rodar no computador

Instale o Node.js e, dentro da pasta:

```bash
npm install
npm start
```

Depois abra:

```text
http://localhost:3000
```

## Testar com duas abas

1. Abra duas abas em `http://localhost:3000`.
2. Coloque nomes diferentes.
3. Na primeira, clique em **Criar sala**.
4. Copie o código.
5. Na segunda, coloque o mesmo código e clique em **Entrar**.
6. Libere o microfone nas duas abas.

## Para usar em celulares ou em computadores diferentes

`localhost` só funciona na própria máquina.

Você precisa publicar o servidor em um serviço que aceite Node.js/WebSocket e usar HTTPS/WSS. O HTML monta automaticamente o WebSocket com:

- `ws://` quando a página está em HTTP;
- `wss://` quando a página está em HTTPS.

Para produção, HTTPS/WSS é o recomendado.

## Observação importante sobre WebRTC

O servidor não transmite o áudio. Ele apenas faz a sinalização necessária para os navegadores encontrarem uns aos outros.

O projeto usa STUN do Google/Cloudflare. Algumas redes podem bloquear conexões WebRTC diretas; nesse caso, para produção, adicione um servidor TURN próprio ou de um provedor confiável.
