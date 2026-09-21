import { createClient } from '@supabase/supabase-js';

// Cliente com a service role key, usado só para as operações no banco
// depois que já sabemos, com certeza, quem é o usuário autenticado.
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

export default async function handler(req, res) {
    // Garante que a requisição seja do tipo POST
    if (req.method !== 'POST') {
        return res.status(405).json({ erro: 'Método não permitido' });
    }

    if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
        console.error('Variáveis de ambiente do Supabase não configuradas.');
        return res.status(500).json({ erro: 'Configuração do servidor incompleta.' });
    }

    // 1. Identifica o usuário pelo token de sessão (Authorization: Bearer <token>),
    //    e NUNCA por um "usuarioId" enviado no corpo da requisição — qualquer
    //    pessoa poderia colocar o ID de outra pessoa ali e mexer na conta dela.
    const authHeader = req.headers.authorization || '';
    const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!jwt) {
        return res.status(401).json({ erro: 'Não autenticado.' });
    }

    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey);
    const { data: userData, error: userError } = await supabaseAuth.auth.getUser(jwt);

    if (userError || !userData?.user) {
        return res.status(401).json({ erro: 'Sessão inválida ou expirada.' });
    }

    const usuarioId = userData.user.id;

    try {
        // 2. Busca os dados do usuário na tabela 'usuarios' do Supabase
        const { data: usuario, error: erroBusca } = await supabaseAdmin
            .from('usuarios')
            .select('status_plano, usou_teste_caixa')
            .eq('id', usuarioId)
            .single();

        if (erroBusca || !usuario) {
            return res.status(404).json({ erro: 'Usuário não encontrado no banco de dados.' });
        }

        const temPlanoAtivo = usuario.status_plano === 'ativo';
        const usouTeste = usuario.usou_teste_caixa;

        // 3. Cenário B: Bloqueado (Já usou o teste e não tem plano ativo)
        if (!temPlanoAtivo && usouTeste) {
            return res.status(403).json({
                sucesso: false,
                codigo: 'TESTE_EXPIRADO',
                mensagem: 'Seu teste gratuito do caixa já foi utilizado. Escolha um plano abaixo para continuar usando!'
            });
        }

        // 4. Cenário A: Pode testar (Ainda não usou e não tem plano)
        if (!temPlanoAtivo && !usouTeste) {
            // Atualiza no Supabase que o usuário usou o teste gratuito
            const { error: erroUpdate } = await supabaseAdmin
                .from('usuarios')
                .update({ usou_teste_caixa: true })
                .eq('id', usuarioId);

            if (erroUpdate) {
                console.error('Erro ao atualizar teste:', erroUpdate);
                return res.status(500).json({ erro: 'Erro ao registrar uso do teste.' });
            }
        }

        // 5. Libera o acesso ao caixa
        return res.status(200).json({
            sucesso: true,
            mensagem: 'Acesso ao caixa liberado.'
        });

    } catch (erro) {
        console.error('Erro interno:', erro);
        return res.status(500).json({ erro: 'Erro interno no servidor.' });
    }
}
