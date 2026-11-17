# INEPAD Reembolso — instruções permanentes

Este repositório é o **INEPAD Reembolso** (antigo COMPROVA), `eduardofalsarellajunior/comprova-reembolsos`. GitHub é o ponto de troca entre as duas contas do Codex Desktop. Não conte com conversas, memórias do agente, credenciais de conectores, arquivos locais ou áreas temporárias da outra conta.

## Antes de qualquer tarefa

1. Leia [PROJECT_STATUS.md](PROJECT_STATUS.md), [PROJECT_CHECKPOINT.md](PROJECT_CHECKPOINT.md) e as entradas relevantes de [PROJECT_LOG.md](PROJECT_LOG.md). Se houver divergência, priorize o pedido atual do usuário, confira os fatos e corrija a documentação pertinente.
2. Confirme a raiz, o remoto correto, o modo de execução, o branch, o SHA, o upstream e se existem alterações staged, unstaged ou untracked:

   ```text
   git rev-parse --show-toplevel
   git rev-parse --git-dir --git-common-dir
   git worktree list --porcelain
   git status --short --branch
   git diff --stat
   git diff --cached --stat
   git remote -v
   git log -5 --oneline --decorate
   git ls-remote origin refs/heads/main
   ```

   Consulte também a referência remota do branch da tarefa, se existir. Se a rede ou a conta não permitir consulta, declare que a informação local pode estar desatualizada. Um SHA que não está no upstream desta branch pode já estar acessível por outra branch; verifique os refs antes de classificar.
3. Identifique arquivos que pertencem ao usuário ou a outra tarefa. Preserve-os. Não atualize, mude de branch, aplique patch externo ou faça merge por cima de trabalho pendente sem isolar as mudanças ou combinar como proceder. Evite `git add .`, `git add -A` sem pathspec, `git clean`, reset destrutivo e push forçado.
4. Divida trabalhos longos em etapas verificáveis. Preserve o comportamento fora do escopo. Não faça push, merge, deploy, migração remota nem mudanças de configuração compartilhada sem autorização para a operação e o alvo.

## Registro e checkpoints

| Arquivo | Como manter |
| --- | --- |
| [PROJECT_STATUS.md](PROJECT_STATUS.md) | Foto atual do produto, arquitetura, operação e pendências. Distinga verificação ao vivo de evidência histórica. |
| [PROJECT_LOG.md](PROJECT_LOG.md) | Acrescente entradas ao final, em ordem cronológica. Nunca apague entradas anteriores; corrija com uma entrada nova. |
| [PROJECT_CHECKPOINT.md](PROJECT_CHECKPOINT.md) | Atualize o ponto de retomada após etapa significativa, antes de mudanças grandes ou interrupções e junto do código a ser transferido. |

- Cada entrada significativa informa data com fuso, escopo, ambiente, branch e SHA de base, arquivos relevantes, decisões, testes realmente executados, resultados, falhas e limites. Use “não executado” ou “não confirmado” quando aplicável.
- Checkpoint mínimo: tarefa e responsável (use um alias), estado da etapa, ambiente/checkout, branch e último SHA compartilhado confirmado, arquivos prontos ou pendentes, testes, bloqueio e **próxima ação exata**. Antes de grandes mudanças, inclua como preservar o estado anterior e quais são os limites de rollback.
- Diferencie: **só nesta árvore** (inclui worktree e arquivos sem commit), **commit local** (não encontrado no remoto), **publicado em branch/PR** (SHA confirmado no GitHub), **integrado** (presente na branch-alvo), **implantado** (confirmado na Vercel/Supabase). Uma etapa não implica a seguinte. Não invente SHA, autorizações, datas de deploy ou resultados.
- Ao receber aviso confiável de limite de uso, checkpoint primeiro; registre somente o que o aviso informou. Não estime consumo, saldo, ou horário de renovação sem evidência.
- Nunca grave credenciais, conteúdo de `.env`, cookies, tokens, links assinados, comprovantes, exportações reais ou dados pessoais desnecessários nos quatro arquivos, commits, PRs ou patches de handoff. Use variáveis pelo nome e exemplos fictícios.

## Transferência entre contas

**Local (inclui o Windows atual).** Abra a raiz do COMPROVA, não a pasta de outro projeto. Para isolar trabalho, use um checkout ou worktree distinto, com uma branch nomeada (`codex/...`); confira o diretório antes de editar. Mantenha apenas um escritor por branch. Se a tarefa local estiver pendente de transferência, prepare o commit por caminhos explícitos, confira o diff completo staged e garanta que os arquivos de continuidade e o código estejam juntos na ponta proposta. Pode haver commits separados, desde que a ponta transmitida inclua ambos. Não faça commit de artefatos acidentais. Faça push só após autorização. As etapas para quem envia e quem recebe estão na seção “Transferência e retomada” do [checkpoint](PROJECT_CHECKPOINT.md).

**Cloud.** Selecione o mesmo repositório e o branch/SHA acordado. Confirme o clone que a tarefa realmente recebeu. Não conte com o disco de outra tarefa ou com worktrees locais. Antes de finalizar, prepare o diff ou commits, confira que o checkpoint e o código fazem parte da mesma entrega e documente o que faltou. Com autorização, publique em branch/PR e confira a referência e o SHA pelo GitHub. Se a tarefa não puder publicar, use apenas uma forma autorizada de recuperação, como entregar um diff para revisão; não presuma acesso pela outra conta. Uma branch de handoff confirmada pode ser lida pela outra conta sem merge na branch-alvo. Não configure a outra conta nem contorne limites de acesso.

**Se houver interrupção ou conflito.** Releia o checkpoint, compare o SHA informado com o remoto e identifique a última etapa comprovada. Se encontrar arquivos ainda só no computador anterior, volte a ele ou solicite o diff/commit autorizado. Não trate trabalho ausente como concluído e não recrie por adivinhação. Se duas contas editaram o log, preserve ambas as entradas. Se o branch divergiu, mantenha as duas pontas e peça alinhamento; não use force push nem integração automática.

## Limites específicos do COMPROVA

- `main` é o ramo de publicação da produção na Vercel. Um push não-main pode disparar Preview; confira o destino e o banco antes de qualquer publicação. Não use ambiente de produção como banco de teste sem autorização explícita para esse uso. Não transfira segredos entre ambientes.
- O banco compartilhado tem schema `comprova`; RLS e políticas dos buckets privados precisam ser preservadas. Não afete `public`, identidades Auth nem objetos de outros sistemas. Antes de migrações, confirme o alvo, a ordem, o histórico, as permissões e a estratégia de recuperação.
- Não crie despesas reais na VExpenses, não ative Conta Azul e não confirme pagamentos reais como teste sem autorização específica. Uma autorização antiga de publicação não habilita automaticamente a próxima.
- Orientação oficial de apoio: [instruções AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md), [worktrees no Codex](https://learn.chatgpt.com/docs/environments/git-worktrees) e [ambiente Cloud](https://learn.chatgpt.com/docs/environments/cloud-environment).

## Continuidade automática — autorização permanente de 17/11/2026

Esta seção especifica a autorização para checkpoints; prevalece sobre trechos anteriores que pedem uma nova confirmação para cada push de continuidade.

- Antes de trabalhar, confira a ponta remota de `codex/continuity`, leia os quatro documentos e verifique o código. Não dependa das conversas da outra conta. Identifique Local, worktree ou Cloud e a pasta/branch reais.
- Divida tarefas em microetapas verificáveis, preferencialmente de cerca de cinco minutos. Ao terminar cada uma, ou ao perceber esse intervalo desde o último registro, atualize o checkpoint **antes** de começar a próxima. Registre preventivamente antes de comandos longos e imediatamente diante de interrupção ou alerta confiável de limite. Não invente saldo de créditos.
- Campos obrigatórios: data/hora e fuso, objetivo, etapa concluída, etapa em execução, arquivos criados/modificados/removidos, decisões, testes e resultados reais, erros/riscos, próxima ação exata, branch/SHA e estado da sincronização.
- Acrescente etapas relevantes ao log sem apagar registros. Atualize o status quando mudar arquitetura, entrega, limitação ou prioridade. Código parcial pode ser salvo, mas marque-o como **incompleto/não testado**, com as falhas e dependências conhecidas.
- O usuário autoriza commits e pushes rotineiros do checkpoint **e do código correspondente exclusivamente em `codex/continuity`**, sem pedir confirmação a cada microetapa. Não é autorização para merge, push à `main`, migração remota ou deploy. Em conflitos, pause somente a operação afetada.
- Antes de cada push, consulte a branch remota e compare com o SHA compartilhado que foi realmente recebido. Se outra conta avançou, preserve as duas versões e coordene; não faça force push, reset ou rebase automático. O push deve ser fast-forward e ter refspec explícito para `refs/heads/codex/continuity`.
- Verifique os caminhos e o conteúdo staged. Use lista explícita: não inclua `.env`, credenciais, dados pessoais, planilhas de membros, comprovantes, capturas, exports reais, caches, dependências ou arquivos temporários. Um scan automático não substitui revisão humana do diff.
- Garanta `git.deploymentEnabled["codex/continuity"] = false` em `vercel.json` no snapshot publicado; não altere as demais branches ou o painel. Confira que não há workflow de deploy adicional antes do primeiro push e sempre que a configuração mudar. Um checkpoint não deve disparar Preview ou produção.
- Local/Windows: use [scripts/sync-continuity.ps1](scripts/sync-continuity.ps1) com a lista revisada [scripts/continuity-files.json](scripts/continuity-files.json) e o SHA remoto esperado. Ele prepara em clone separado para preservar índice/branch da pasta original; não executa instalações, migrações ou deploy.
- Em worktree, documente o caminho e a branch de cada árvore. Não copie o `.git` nem troque a branch de uma árvore suja. O script também pode ler a árvore de origem de um worktree sem modificá-la.
- Cloud sem PowerShell: prepare a mesma lista de arquivos e os quatro documentos no clone isolado, confirme o remoto esperado, verifique segredos e bloqueio de deploy e use commit/push normal explícito. Se a tarefa só oferecer PR/diff, registre que a sincronização direta não ocorreu e utilize somente o mecanismo autorizado. Nunca faça merge para resolver essa limitação.
- Após o push, confirme a referência e o SHA com `git ls-remote`. Um commit local, link de PR ou diff não prova acesso pela outra conta. No arquivo versionado, identifique a revisão-base e como conferir a ponta; não tente escrever o SHA do próprio commit nele. Registre o SHA de entrega na resposta/log local posterior ou no checkpoint seguinte.
- As instruções orientam a sessão ativa; **não existe temporizador garantido, daemon de salvamento ou execução enquanto o Codex está fechado ou sem créditos**. Ao faltar rede ou permissão, salve localmente e marque “sincronização pendente”. Continue a tarefa depois de checkpoints rotineiros, sem parar para relatórios ou novas aprovações.
