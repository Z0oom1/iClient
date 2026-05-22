# CRM DevHub 🚀

Um aplicativo de alta fidelidade visual (premium glassmorphism, inspirado no iOS) e funcionalidade offline completa, feito especificamente para o Caio (desenvolvedor full stack) gerenciar seus clientes, projetos, finanças e reuniões de maneira integrada.

## 📱 Funcionalidades

1. **🔒 Login Seguro:** Autenticação local para manter seus dados de clientes confidenciais.
   * **Usuário:** `caio`
   * **Senha:** `1414`
2. **📊 Dashboard Premium:** 
   * **Finanças:** Faturamento total acumulado, receita mensal estimada e valor/hora médio.
   * **Métricas:** Projetos concluídos vs. restantes e gráficos visuais do andamento do portfólio.
   * **Próximas Reuniões:** Cards dinâmicos com contagem regressiva em tempo real.
3. **👥 Gestão de Clientes e Projetos:**
   * Cadastro completo com Nome, Empresa, Contatos e Detalhes.
   * **Categorias:** Site, App, Software, Sistema.
   * **Estados do Projeto:** Idealizando, Estrutura sendo feita, Fase de testes, Deploy, Manutenção.
   * **Sincronização com GitHub:** Puxe dados em tempo real de repositórios públicos (estrelas, issues, último commit, linguagem) diretamente para o painel do cliente!
   * **Links Úteis:** Acesso direto ao repositório Git e ao link de Deploy do projeto.
4. **⏳ Linha do Tempo & Prazos:**
   * Acompanhamento do primeiro contato e dos próximos agendados.
   * Contadores regressivos automáticos e notificações internas para reuniões eminentes.
5. **📝 Lembretes & Notas:**
   * Lista de To-Do rápida para o dia a dia de desenvolvimento.
   * Bloco de notas flexível (Scratchpad) para armazenar snippets de código ou informações rápidas.
6. **⚙️ Configurações & Segurança:**
   * **Backup Total:** Exporte e importe todos os seus dados em formato JSON com um único clique.
   * **Token GitHub:** Campo seguro para configurar um Personal Access Token para também monitorar repositórios privados.
   * **Reset:** Limpeza rápida do banco de dados local.

## 🛠️ Como Iniciar

Como o aplicativo é uma Single Page Application (SPA) pura baseada em `localStorage`, você tem duas maneiras super simples de executá-lo:

### Opção 1: Diretamente no Navegador (Sem Instalação)
Basta abrir o arquivo [index.html](file:///Users/caiorodrigues/Documents/Clientes/index.html) dando dois cliques nele para carregar o aplicativo instantaneamente!

### Opção 2: Usando o Servidor Local de Desenvolvimento
Se você preferir rodar em um servidor local com reload automático:
1. Abra o terminal na pasta do projeto.
2. Instale dependências e inicie o servidor:
   ```bash
   npm install
   npm run dev
   ```
3. O aplicativo estará acessível em `http://localhost:3000`.

---

Desenvolvido com carinho para otimizar sua rotina full stack! 💻✨
