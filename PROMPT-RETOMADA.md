# Prompt reutilizável de retomada — INEPAD Reembolso

Copie o texto abaixo no Codex ao retomar o projeto, nesta conta ou em outra. Use sempre a ponta mais recente da branch; não fixe um SHA antigo. O computador/conta precisa ter acesso ao repositório GitHub. Não é necessário copiar conversas.

```text
Retome o desenvolvimento do INEPAD Reembolso (antigo COMPROVA) a partir do último estado efetivamente preservado.

Repositório: https://github.com/eduardofalsarellajunior/comprova-reembolsos
Branch permanente de continuidade: codex/continuity.
Não use a main como substituta do trabalho em andamento.

1. Identifique o ambiente real: Local, worktree ou Cloud. Confirme a raiz Git e o remoto antes de editar. Não presuma que o diretório inicial pertence a este produto. Não presuma acesso aos chats, arquivos privados ou credenciais da outra conta.

2. Leia AGENTS.md, PROJECT_STATUS.md, PROJECT_CHECKPOINT.md e os registros relevantes de PROJECT_LOG.md. Verifique o código, e não só o texto. Identifique o que está concluído, parcial, não testado, apenas local, publicado na continuidade ou implantado. Em divergências, preserve o trabalho e confira as evidências; o pedido atual do usuário tem precedência.

3. Confira status, diff, staged/untracked, branch, SHA, upstream, worktrees e a ponta remota:
   git rev-parse --show-toplevel
   git status --short --branch
   git diff --stat
   git diff --cached --stat
   git remote -v
   git worktree list --porcelain
   git log -5 --oneline --decorate
   git ls-remote origin refs/heads/codex/continuity refs/heads/main

4. Em clone limpo, obtenha codex/continuity e confira o SHA materializado contra o remoto. Se a branch local já existir, atualize somente por fast-forward, com a árvore limpa. Não dê pull, switch ou merge por cima de alterações pendentes. Se necessário, use clone separado para preservar a pasta original. Em Cloud, confirme a branch e o código que a tarefa realmente recebeu; cada ambiente pode ser isolado.

5. Continue a próxima ação exata do checkpoint, dentro do escopo autorizado, sem refazer etapas comprovadas. Se o snapshot estiver incompleto, primeiro restaure a compilação e os testes apontados. Não trate uma migração presente no Git como aplicada nem uma interface pronta como fluxo validado.

6. Faça checkpoints preventivos automaticamente: divida o desenvolvimento em microetapas verificáveis de cerca de CINCO MINUTOS. Ao concluir cada uma, ou perceber que aproximadamente cinco minutos passaram desde o último registro, atualize PROJECT_CHECKPOINT.md ANTES da próxima etapa. Faça isso também antes de operações longas, interrupções e alertas confiáveis de limite. Não espere um aviso final para salvar.

7. Cada checkpoint deve registrar data/hora com fuso America/Sao_Paulo, objetivo, última etapa concluída, etapa em execução, arquivos criados/modificados/removidos, decisões, testes realmente executados e resultados, falhas/riscos, próxima ação exata, branch/SHA e estado real da sincronização. Acrescente eventos relevantes ao PROJECT_LOG.md sem apagar entradas anteriores; atualize PROJECT_STATUS.md quando a situação mudar.

8. Estão autorizados commits e pushes automáticos dos checkpoints E do código correspondente SOMENTE para codex/continuity, sem pedir confirmação rotineira. Use a lista explícita revisada scripts/continuity-files.json. Inclua novos arquivos necessários à tarefa nessa lista; não copie arquivos privados, .env, credenciais, comprovantes, planilhas reais, capturas ou caches. Revise o conteúdo staged; o scanner não substitui essa revisão.

9. Antes de cada push, compare a ponta remota com a revisão que você efetivamente recebeu. Se outra conta avançou, não sobrescreva: preserve ambas as versões e coordene. Não esconda divergência passando um SHA recém-consultado sem revisar o código. Use somente push normal, fast-forward e refspec explícito para refs/heads/codex/continuity. Nunca faça force push ou integração automática.

10. No Windows, use scripts/sync-continuity.ps1 -ExpectedRemoteSha <SHA-remoto-conferido> -Publish. O script cria o commit num clone separado, sem alterar branch/índice da origem. A opção "absent" só serve para a primeira criação, não para retomadas. Em Cloud sem PowerShell, siga as mesmas verificações por Git. Se só houver entrega via PR/diff, documente a limitação; não faça merge para contorná-la.

11. Mantenha git.deploymentEnabled["codex/continuity"] = false em vercel.json e verifique outros gatilhos de deploy. Depois do push, confirme o SHA no GitHub. Não afirme que um commit só local foi transferido nem que o acesso da segunda conta foi testado. Preserve a main e o ambiente em produção. Não faça merge, push à main, deploy, migração remota, importação real ou envio de e-mails sem autorização específica para a operação.

12. Preserve o isolamento no Supabase compartilhado: schema comprova, buckets privados exclusivos e RLS. Não altere public, auth.users nem recursos de outros sistemas. Não invente campos da planilha, vínculos de projeto, aprovadores ou resultados de testes. Peça o arquivo privado quando ele for realmente necessário e não estiver disponível.

13. Cinco minutos é uma meta operacional DURANTE A SESSÃO ATIVA, não um temporizador garantido. Não prometa salvamento com o Codex fechado, desconectado ou sem créditos, nem invente consumo/saldo. Se rede/permissões bloquearem o push, salve localmente e marque a sincronização pendente. Pause apenas a operação insegura; continue as verificações que forem possíveis.

Comece agora: confirme repositório, branch e último checkpoint, informe brevemente o ponto de retomada e execute a próxima microetapa. Após os checkpoints rotineiros, continue trabalhando sem pedir novas confirmações.
```
