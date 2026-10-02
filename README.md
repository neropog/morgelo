# Morgílio em todo o YouTube

Projeto de entretenimento pessoal inspirado na interface do YouTube. Não tem relação com o YouTube real.

## Colocar no Render

1. Extraia o ZIP. Coloque o conteúdo da pasta `morgilio-estatico` na raiz de um repositório GitHub: `public/`, `README.md` e `render.yaml`.
2. No Render, escolha **New → Static Site**, conecte o repositório e a branch desejada.
3. Use estas configurações:

| Campo | Valor |
| --- | --- |
| Root Directory | Deixe vazio se `public/` estiver na raiz do repositório |
| Build Command | `echo "Site estatico pronto"` |
| Publish Directory | `public` |

4. Clique em **Create Static Site** e abra o endereço gerado. Também é possível usar o `render.yaml` como Blueprint.

Não use o antigo `server.js`. Este pacote não precisa de backend, npm install ou banco de dados remoto.

Documentação do Render: https://render.com/docs/static-sites

## Testar no computador

Abra `public/index.html` no navegador, ou use o Live Server do VS Code. Agora ele funciona com Live Server, pois não há chamadas `/api/...`.

Para um endereço local estável, também pode usar:

```bash
python -m http.server 5500 --directory public
```

Depois abra http://localhost:5500. O armazenamento pertence ao endereço em uso: `localhost`, `127.0.0.1` e o endereço do Render têm dados separados. Recomenda-se testar sempre no mesmo endereço.

## O que funciona

- Página inicial já preenchida com a foto `morgilio.png`, quatro canais e dezesseis posts, incluindo Shorts.
- Busca, categorias, inscrições, curtidas, histórico e assistir mais tarde.
- Criar/editar canais, foto e banner.
- Enviar fotos e vídeos, miniaturas e Shorts, editar e excluir posts.
- Vídeos reais usam o player do navegador; os posts iniciais são fotos e simulam a duração.
- Comentários, respostas e edição/exclusão.
- Tema claro/escuro, navegação por `#` e layout responsivo.
- Studio, backup JSON, restauração e exportação do conteúdo público.
- Ícones, CSS e imagem incluídos: sem CDN obrigatório.

Transmissão ao vivo foi retirada porque exige um serviço externo. Pesquisa por voz depende do suporte/permissão do navegador. Prefira MP4 com H.264 ou WebM para vídeos; a extensão MOV/MKV sozinha não garante reprodução no navegador.

## Onde ficam os uploads

Arquivos enviados, posts, canais e comentários ficam no **IndexedDB deste navegador**. O limite por arquivo é 100 MB e o espaço total depende do navegador/dispositivo. Curtidas e preferências ficam no localStorage. Se o armazenamento estiver bloqueado, a página informa o erro.

Isso não envia arquivos ao Render e não sincroniza com outros aparelhos. Seu amigo verá o conteúdo público incluído no site, mas não verá suas alterações locais automaticamente. Compartilhar o link de um post que só existe localmente também não o disponibiliza para outra pessoa.

Limpar os dados do navegador apaga essas alterações. Use **Studio → Backup e espaço → Baixar backup JSON** para guardá-las. Backups `.tar` do antigo servidor não são compatíveis.

## Fazer suas alterações aparecerem para seu amigo

1. Faça uploads, edite títulos e canais no site.
2. Abra **Studio → Backup e espaço**.
3. Clique em **Exportar conteúdo público (seed.js)**.
4. Substitua `public/seed.js` no repositório pelo arquivo baixado e faça commit.
5. Aguarde o novo deploy. Novos visitantes já carregarão esse conteúdo.
6. Em um navegador que já abriu o site antes, use **Recarregar conteúdo publicado** nessa mesma aba do Studio para substituir os dados locais pela nova versão. Faça backup primeiro se quiser preservar suas alterações locais.

O arquivo exportado inclui as mídias dos uploads locais como dados embutidos; para este projeto simples, prefira fotos e vídeos curtos. Vídeos longos tornam o arquivo muito grande. Para compartilhar muitos vídeos grandes, seria necessário armazenamento externo.

## Arquivos

- `public/index.html`: estrutura.
- `public/styles.css`: estilos completos da interface.
- `public/icons.css`: ícones locais.
- `public/api.js`: dados locais, uploads, exportação, backup e preparo de mídia.
- `public/script.js`: páginas e interações.
- `public/seed.js`: conteúdo inicial público, editável ou exportável no Studio.
- `public/morgilio.png`: foto enviada, usada no conteúdo inicial.
- `render.yaml`: configuração opcional para Render Blueprint.
