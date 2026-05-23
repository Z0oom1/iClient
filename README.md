# Meus Clientes 🚀

Um aplicativo de alta fidelidade visual (premium glassmorphism, inspirado no iOS) e funcionalidade offline-first completa, feito especificamente para desenvolvedores profissionais e freelancers gerenciarem seus clientes, projetos, finanças e reuniões de maneira integrada e multi-contas.

---

## 📱 Novas Funcionalidades Multi-Contas

1. **👥 Cadastro e Criação de Contas:**
   * Cada usuário possui sua própria conta, identificada por Nome Completo, e-mail (Gmail), Senha e Nome da Empresa.
2. **📸 Logotipo Customizado:**
   * Suporte para upload de logotipo da empresa. O sistema processa e comprime a imagem localmente (Base64), exibindo o logotipo de forma circular premium no cabeçalho do painel.
3. **📩 Simulador do Gmail de Alta Fidelidade:**
   * Caixa de entrada simulada que aparece flutuando em tela para prover os códigos PIN OTP de 6 dígitos para validação de cadastro e recuperação de senha ("Esqueci minha senha").
4. **🔒 Isolamento Total de Dados:**
   * Todos os dados (clientes, lembretes, notas e tokens de integração) são prefixados com o e-mail do usuário ativo no `localStorage`, garantindo total privacidade entre contas no mesmo navegador.
5. **☁️ Sincronização em Nuvem Supabase Multi-Tenant:**
   * Permite conectar qualquer banco Supabase gratuito inserindo a URL e a Anon Key nas configurações. O sistema realiza o isolamento lógico das informações de cada usuário na nuvem por meio do e-mail ativo.

---

## 🛠️ Como Iniciar & Deploy no Vercel

### 1. Fazer o Push para o GitHub e Vercel
1. O commit local já foi criado com todas as novas funcionalidades.
2. Abra o terminal na pasta do projeto e envie o código para o seu repositório:
   ```bash
   git push origin main
   ```
3. Acesse o painel da **Vercel** (https://vercel.com).
4. Clique em **Add New > Project**, selecione o repositório `iClient` e faça o deploy (como é uma Single Page Application pura de HTML/CSS/JS, o Vercel fará o deploy instantâneo de forma gratuita).

### 2. Configurar o Supabase (Banco de Dados Gratuito)
Para salvar seus dados na nuvem para sempre, crie um projeto gratuito no [Supabase](https://supabase.com) e execute o script SQL abaixo no **SQL Editor** do painel do Supabase:

```sql
-- 1. Tabela de Perfis de Usuários (Login)
CREATE TABLE IF NOT EXISTS public.profiles (
    email TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    password TEXT NOT NULL,
    company TEXT NOT NULL,
    logo TEXT, -- Base64 do logotipo
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Tabela de Clientes
CREATE TABLE IF NOT EXISTS public.clients (
    id TEXT PRIMARY KEY,
    user_email TEXT NOT NULL, -- Campo de isolamento lógico
    name TEXT NOT NULL,
    company TEXT,
    email TEXT,
    phone TEXT,
    project_name TEXT NOT NULL,
    project_type TEXT NOT NULL,
    project_status TEXT NOT NULL,
    project_git TEXT,
    project_deploy TEXT,
    project_cost NUMERIC,
    project_hours INTEGER,
    date_first_contact TEXT NOT NULL,
    date_next_contact TEXT,
    notes TEXT,
    git_cached_data JSONB,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Tabela de Lembretes (To-Dos)
CREATE TABLE IF NOT EXISTS public.todos (
    id TEXT PRIMARY KEY,
    user_email TEXT NOT NULL, -- Campo de isolamento lógico
    text TEXT NOT NULL,
    completed BOOLEAN DEFAULT false NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Tabela do Bloco de Notas (Scratchpad)
CREATE TABLE IF NOT EXISTS public.scratchpad (
    id TEXT NOT NULL,
    user_email TEXT NOT NULL, -- Campo de isolamento lógico
    content TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    PRIMARY KEY (id, user_email)
);

-- 5. IMPORTANTE: Desative o RLS (Row Level Security) para permitir que a REST API
-- com a chave anônima (anon key) possa ler e gravar dados livremente.
ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.todos DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.scratchpad DISABLE ROW LEVEL SECURITY;
```

### 3. Conectar o App com a Nuvem
1. No seu aplicativo implantado no Vercel (ou rodando localmente), faça login na sua conta.
2. Navegue até a aba **Configurações** (ícone de engrenagem).
3. Insira a **URL do Supabase** e a **Anon Key** (disponíveis no painel do seu projeto Supabase em *Settings > API*).
4. Clique em **Conectar Sincronização**. O sistema enviará seus dados locais atuais para o banco e sincronizará automaticamente todas as alterações futuras na nuvem!
