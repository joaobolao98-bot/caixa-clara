import { createClient } from '@supabase/supabase-js';

// Inicializa o cliente do Supabase para o backend
// É recomendado usar variáveis de ambiente na Vercel para maior segurança
const supabaseUrl = process.env.SUPABASE_URL || 'https://jezjhglhuyclvbjxkxaq.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY; 
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req, res) {
    // Garante que a requisição seja do tipo POST
    if (req.method !== 'POST') {
        return res.status(405).json({ erro: 'Método não permitido' });
    }

    const { usuarioId } = req.body;

    if (!usuarioId) {
        return res.status(400).json({ erro: 'ID do usuário não fornecido.' });
    }

    try {
        // 1. Busca os dados do usuário na tabela 'usuarios' do Supabase
        const { data: usuario, error: erroBusca } = await supabase
            .from('usuarios')
            .select('status_plano, usou_teste_caixa')
            .eq('id', usuarioId)
            .single();

        if (erroBusca || !usuario) {
            return res.status(404).json({ erro: 'Usuário não encontrado no banco de dados.' });
        }

        const temPlanoAtivo = usuario.status_plano === 'ativo';
        const usouTeste = usuario.usou_teste_caixa;

        // 2. Cenário B: Bloqueado (Já usou o teste e não tem plano ativo)
        if (!temPlanoAtivo && usouTeste) {
            return res.status(403).json({
                sucesso: false,
                codigo: 'TESTE_EXPIRADO',
                mensagem: 'Seu teste gratuito do caixa já foi utilizado. Escolha um plano abaixo para continuar usando!'
            });
        }

        // 3. Cenário A: Pode testar (Ainda não usou e não tem plano)
        if (!temPlanoAtivo && !usouTeste) {
            // Atualiza no Supabase que o usuário usou o teste gratuito
            const { error: erroUpdate } = await supabase
                .from('usuarios')
                .update({ usou_teste_caixa: true })
                .eq('id', usuarioId);

            if (erroUpdate) {
                console.error('Erro ao atualizar teste:', erroUpdate);
                return res.status(500).json({ erro: 'Erro ao registrar uso do teste.' });
            }
        }

        // 4. Libera o acesso ao caixa
        return res.status(200).json({
            sucesso: true,
            mensagem: 'Acesso ao caixa liberado.'
        });

    } catch (erro) {
        console.error('Erro interno:', erro);
        return res.status(500).json({ erro: 'Erro interno no servidor.' });
    }
}
