# asteria-ai-worker

Um orquestrador autônomo e CLI local para integrar tarefas do Azure DevOps (ADO) com agentes de IA locais (Claude CLI ou Gemini CLI).

O **Asteria AI Worker** atua como uma ponte: ele busca Tarefas atribuídas no seu quadro ADO, clona o repositório relacionado, injeta regras globais e servidores MCP da sua empresa na pasta do projeto e invoca o seu agente de IA preferido para executar o código. Ao final, ele verifica se a tarefa foi um sucesso ou se precisa de ajuda humana, atualizando o status do ADO adequadamente.

## O que ele faz

1. **Seleção Inteligente:** Consulta o ADO por Tarefas (Tasks) marcadas com a tag `ai-worker` atribuídas a você.
2. **Contexto Completo:** Busca a descrição do Product Backlog Item (PBI) pai para alimentar a IA com as regras de negócio e critérios de aceitação.
3. **Gerenciamento de Workspace:** Clona localmente o repositório (Git) contido na tarefa em uma pasta isolada.
4. **Contexto Dinâmico (Skills e MCPs):** Lê as configurações globais da sua máquina (`.claude` ou `.gemini`) ou sincroniza um repositório remoto de regras e injeta tudo na pasta clonada.
5. **Execução de Agentes Locais:** Dispara processos filhos executando `claude` ou `gemini` na sua máquina local, entregando instruções rigorosas sobre a tarefa.
6. **Tratamento de Contratos:** Aguarda a IA criar o arquivo de "aperto de mão" (`.asteria-result.json`) garantindo que o trabalho foi feito e "commitado".
7. **Atualização do ADO:** Move a Task para `Done` (ou `Quarantine` se houver bloqueios). Move o PBI pai para `Test` quando todas as tarefas estiverem finalizadas.
8. **Logging Completo:** Salva todos os passos tomados pelo worker e as saídas das IAs em arquivos `.txt` (por data) dentro da pasta `/logs`.

## Configuração

A configuração é centralizada em **um único arquivo JSON**.

1. Crie o diretório `config/` na raiz do projeto (se não existir).
2. Crie um arquivo chamado `settings.json` dentro dele. (Este arquivo é ignorado pelo Git para proteger suas senhas).

### Modelo do `config/settings.json`

```json
{
  "ado": {
    "org": "sua-organizacao",
    "pat": "seu-token-de-acesso-pessoal",
    "assignedTo": "seu-email@dominio.com.br"
  },
  "workspace": {
    "dir": "C:/caminho/onde/o/worker/vai/clonar/os/repositorios",
    "bashPath": "C:/Program Files/Git/bin/bash.exe"
  },
  "globalResourcesRepo": "https://github.com/sua-empresa/asteria-global-resources.git",
  "tokenLimitThreshold": 150000
}
```

#### Dicionário de Configuração
- `ado.org`: Nome da sua organização no Azure DevOps.
- `ado.pat`: Personal Access Token gerado no ADO (precisa de permissão de leitura/escrita de Work Items).
- `ado.assignedTo`: E-mail associado ao perfil que o worker usará para buscar as Tasks (geralmente o seu).
- `workspace.dir`: Uma pasta segura na sua máquina onde ele pode criar subpastas e fazer o git clone pesado de cada tarefa.
- `workspace.bashPath`: Caminho para o executável do Bash (opcional, fallback interno se a IA precisar usar scripts de terminal).
- `globalResourcesRepo` (Opcional): Uma URL Git de um repositório contendo pastas `skills/` e `mcps/`. Se a sua máquina local não possuir as configurações globais dos agentes instaladas (`~/.claude`), o Worker fará o download deste repo e injetará no projeto clonado como _Fallback Inteligente_.
- `tokenLimitThreshold`: (Opcional) Limite geral de precaução para a execução da engine nativa.

## Como Executar

O worker funciona via linha de comando (CLI). O comando principal requer a compilação do TypeScript e invoca o arquivo `dist/index.js`. Você deve passar o agente desejado como primeiro parâmetro e (opcionalmente) o limite de horas.

```bash
# Compile antes de usar (se tiver modificado o código fonte)
npm run build

# Executar com Claude (sem limite de tempo)
node dist/index.js claude

# Executar com Gemini CLI por no máximo 2 horas e meia
node dist/index.js gemini 2.5
```

### O Contrato IA <-> Worker

A IA (Claude ou Gemini) deve ser capaz de criar um arquivo chamado `.asteria-result.json` na raiz da pasta que ela estiver modificando. O Worker entrega essa regra no prompt inicial para a IA. Exemplo de contrato gerado pela IA ao finalizar:

```json
{
  "outcome": "done",
  "message": "Implementei a tela de login conforme PBI 1234. Arquivos commitados e enviados."
}
```
*Se a IA travar ou precisar do Pedro Nunes para responder uma dúvida de negócio complexa, ela criará este arquivo com `outcome: quarantine`.*

## Logs

Todos os passos orquestrados pelo worker e o output puro das IAs (sem códigos de escape ou cores ANSI que poluem arquivos de texto) são gravados de forma limpa na pasta `logs/` na raiz do seu Worker, em arquivos nomeados por data (ex: `2026-04-17.txt`).
