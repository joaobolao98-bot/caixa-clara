import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ erro: 'Método não permitido' });
    }

    if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
        console.error('Variáveis de ambiente do Supabase não configuradas.');
        return res.status(500).json({ erro: 'Configuração do servidor incompleta.' });
    }

    // Identifica o usuário pelo token de sessão, nunca por um ID vindo do
    // corpo da requisição (evita que alguém consulte/altere dados de outra conta).
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
        const { data: usuario, error: erroBusca } = await supabaseAdmin
            .from('usuarios')
            .select('status_plano, usou_teste_caixa')
            .eq('id', usuarioId)
            .single();

        if (erroBusca || !usuario) {
            return res.status(404).json({ erro: 'Usuário não encontrado.' });
        }

        const temPlanoAtivo = usuario.status_plano === 'ativo';
        const usouTeste = usuario.usou_teste_caixa;

        // Se não tem plano e já usou o teste gratuito
        if (!temPlanoAtivo && usouTeste) {
            return res.status(403).json({
                sucesso: false,
                codigo: 'TESTE_EXPIRADO',
                mensagem: 'O seu período de teste gratuito terminou. Escolha um plano abaixo para continuar a gerir o seu negócio!'
            });
        }

        // Se não tem plano mas ainda não usou, marca o teste como utilizado
        if (!temPlanoAtivo && !usouTeste) {
            await supabaseAdmin
                .from('usuarios')
                .update({ usou_teste_caixa: true })
                .eq('id', usuarioId);
        }

        return res.status(200).json({ sucesso: true });

    } catch (erro) {
        console.error('Erro interno:', erro);
        return res.status(500).json({ erro: 'Erro interno no servidor.' });
    }
}
