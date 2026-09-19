import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || 'https://jezjhglhuyclvbjxkxaq.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY; 
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ erro: 'Método não permitido' });
    }

    const { usuarioId } = req.body;

    if (!usuarioId) {
        return res.status(400).json({ erro: 'ID do usuário não fornecido.' });
    }

    try {
        const { data: usuario, error: erroBusca } = await supabase
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
            await supabase
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
