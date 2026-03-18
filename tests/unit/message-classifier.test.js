'use strict';

const {
  classifyMessage,
  suggestContent,
  hasOperationalContext,
  hasImpact,
  isNoise,
  MIN_PATTERN_THRESHOLD,
  SUGGESTION_THRESHOLD,
} = require('../../bin/lib/message-classifier');

// ── Noise Filter ────────────────────────────────────────────────

describe('isNoise', () => {
  test('filters empty and very short messages', () => {
    expect(isNoise('')).toBe(true);
    expect(isNoise('oi')).toBe(true);
    expect(isNoise('ab')).toBe(true);
  });

  test('filters casual greetings', () => {
    expect(isNoise('oi tudo bem?')).toBe(true);
    expect(isNoise('Bom dia')).toBe(true);
    expect(isNoise('Boa noite')).toBe(true);
    expect(isNoise('Oiii')).toBe(true);
    expect(isNoise('Fala')).toBe(true);
  });

  test('filters short reaction-only messages', () => {
    expect(isNoise('kkkkk')).toBe(true);
    expect(isNoise('hahaha')).toBe(true);
    expect(isNoise('sim')).toBe(true);
    expect(isNoise('ok')).toBe(true);
    expect(isNoise('blz')).toBe(true);
  });

  test('filters short messages with question mark (social)', () => {
    expect(isNoise('E agr Gui?')).toBe(true);
    expect(isNoise('Oiii tudo bem?')).toBe(true);
    expect(isNoise('Grafico?')).toBe(true);
    expect(isNoise('Oi?')).toBe(true);
  });

  test('does NOT filter operational messages', () => {
    expect(isNoise('Como faco deposito via pix?')).toBe(false);
    expect(isNoise('Nao consigo sacar meu dinheiro da plataforma')).toBe(false);
    expect(isNoise('Qual entrada faço agora na roleta?')).toBe(false);
  });
});

// ── Operational Context ─────────────────────────────────────────

describe('hasOperationalContext', () => {
  test('detects financial terms', () => {
    expect(hasOperationalContext('quero fazer deposito')).toBe(true);
    expect(hasOperationalContext('como sacar dinheiro')).toBe(true);
    expect(hasOperationalContext('meu saldo esta errado')).toBe(true);
    expect(hasOperationalContext('pix nao caiu')).toBe(true);
  });

  test('detects platform terms', () => {
    expect(hasOperationalContext('como entro na plataforma')).toBe(true);
    expect(hasOperationalContext('nao consigo acessar a conta')).toBe(true);
    expect(hasOperationalContext('problema no cadastro')).toBe(true);
    expect(hasOperationalContext('meu login nao funciona')).toBe(true);
  });

  test('detects strategy terms', () => {
    expect(hasOperationalContext('qual entrada agora')).toBe(true);
    expect(hasOperationalContext('sinal de green')).toBe(true);
    expect(hasOperationalContext('estrategia para roleta')).toBe(true);
  });

  test('rejects social/casual messages', () => {
    expect(hasOperationalContext('tudo bem com voce')).toBe(false);
    expect(hasOperationalContext('ferrou kkkk')).toBe(false);
    expect(hasOperationalContext('dei mole')).toBe(false);
    expect(hasOperationalContext('bom dia galera')).toBe(false);
  });
});

// ── Impact Assessment ───────────────────────────────────────────

describe('hasImpact', () => {
  test('detects money impact', () => {
    expect(hasImpact('perdi meu dinheiro')).toBe(true);
    expect(hasImpact('deposito nao caiu')).toBe(true);
    expect(hasImpact('meu saldo zerou')).toBe(true);
  });

  test('detects action impact', () => {
    expect(hasImpact('tentei sacar e nao deu')).toBe(true);
    expect(hasImpact('cliquei no link e nao abriu')).toBe(true);
    expect(hasImpact('depositei via pix')).toBe(true);
  });

  test('detects experience impact', () => {
    expect(hasImpact('nao consigo entender')).toBe(true);
    expect(hasImpact('preciso de ajuda com o app')).toBe(true);
  });

  test('rejects no-impact messages', () => {
    expect(hasImpact('tudo certo galera')).toBe(false);
    expect(hasImpact('boa noite')).toBe(false);
  });
});

// ── classifyMessage — DUVIDAS ───────────────────────────────────

describe('classifyMessage — duvidas', () => {
  test('classifies real operational questions as duvida', () => {
    expect(classifyMessage('Como faco deposito?')).toContain('duvida');
    expect(classifyMessage('Como sacar o dinheiro?')).toContain('duvida');
    expect(classifyMessage('Onde vejo o saldo?')).toContain('duvida');
    expect(classifyMessage('Qual entrada faco agora na roleta?')).toContain('duvida');
    expect(classifyMessage('Por que nao caiu meu saque?')).toContain('duvida');
    expect(classifyMessage('Alguem sabe como fazer cadastro na plataforma?')).toContain('duvida');
    expect(classifyMessage('Como funciona o bonus de deposito?')).toContain('duvida');
  });

  test('does NOT classify social questions as duvida', () => {
    expect(classifyMessage('E agr Gui?')).not.toContain('duvida');
    expect(classifyMessage('Oiii tudo bem?')).not.toContain('duvida');
    expect(classifyMessage('Grafico?')).not.toContain('duvida');
    expect(classifyMessage('Quem ai?')).not.toContain('duvida');
    expect(classifyMessage('Alguem?')).not.toContain('duvida');
  });
});

// ── classifyMessage — DORES ─────────────────────────────────────

describe('classifyMessage — dores', () => {
  test('classifies real operational pains as dor', () => {
    expect(classifyMessage('Nao consigo sacar meu dinheiro')).toContain('dor');
    expect(classifyMessage('Depositei via pix e nao caiu o saldo')).toContain('dor');
    expect(classifyMessage('Cliquei no link e nao abriu a plataforma')).toContain('dor');
    expect(classifyMessage('O app travou quando tentei depositar')).toContain('dor');
    expect(classifyMessage('Nao consigo acessar minha conta no site')).toContain('dor');
  });

  test('does NOT classify casual complaints as dor', () => {
    expect(classifyMessage('ferrou kkkkk')).not.toContain('dor');
    expect(classifyMessage('dei mole')).not.toContain('dor');
    expect(classifyMessage('perdi tudo')).not.toContain('dor');
    expect(classifyMessage('complicado hein')).not.toContain('dor');
    expect(classifyMessage('horrivel isso')).not.toContain('dor');
  });
});

// ── classifyMessage — ENGAJAMENTO ───────────────────────────────

describe('classifyMessage — engajamento', () => {
  test('classifies engagement messages', () => {
    expect(classifyMessage('Top demais esse grupo!')).toContain('engajamento');
    expect(classifyMessage('Muito obrigado pela ajuda')).toContain('engajamento');
    expect(classifyMessage('Sensacional esse metodo na roleta')).toContain('engajamento');
  });
});

// ── classifyMessage — META TAGS ─────────────────────────────────

describe('classifyMessage — meta tags', () => {
  test('tags long messages', () => {
    const longMsg = 'a'.repeat(201);
    expect(classifyMessage(longMsg)).toContain('mensagem_longa');
  });

  test('tags messages with links', () => {
    expect(classifyMessage('Veja em https://exemplo.com/deposito como fazer deposito')).toContain('link');
  });

  test('defaults to geral for unclassified messages', () => {
    expect(classifyMessage('bom dia pessoal')).toContain('geral');
    expect(classifyMessage('Legal')).toContain('geral');
  });
});

// ── suggestContent — Pattern-Based ──────────────────────────────

describe('suggestContent', () => {
  test('only generates suggestions above threshold', () => {
    const analysis = {
      questions: [
        { text: 'Como faco deposito?', count: 20 },
        { text: 'Onde vejo saldo?', count: 3 }, // Below threshold
      ],
      pains: [
        { text: 'Nao consigo sacar', count: 15 },
        { text: 'App travou', count: 2 }, // Below threshold
      ],
      topics: { bigrams: [['roleta online', 25]], trigrams: [] },
      viral: [],
    };

    const suggestions = suggestContent(analysis);

    // Only high-count items should generate suggestions
    const questionSuggestions = suggestions.filter(s => s.source === 'duvida_recorrente');
    expect(questionSuggestions).toHaveLength(1);
    expect(questionSuggestions[0].occurrences).toBe(20);

    const painSuggestions = suggestions.filter(s => s.source === 'dor_da_audiencia');
    expect(painSuggestions).toHaveLength(1);
    expect(painSuggestions[0].occurrences).toBe(15);
  });

  test('returns empty when no patterns meet threshold', () => {
    const analysis = {
      questions: [{ text: 'Raro', count: 1 }],
      pains: [{ text: 'Raro', count: 2 }],
      topics: { bigrams: [['tema raro', 3]], trigrams: [] },
      viral: [],
    };

    const suggestions = suggestContent(analysis);
    expect(suggestions).toHaveLength(0);
  });

  test('includes occurrences count in suggestion', () => {
    const analysis = {
      questions: [{ text: 'Como depositar?', count: 10 }],
      pains: [],
      topics: { bigrams: [], trigrams: [] },
      viral: [],
    };

    const suggestions = suggestContent(analysis);
    expect(suggestions[0].occurrences).toBe(10);
  });

  test('sets correct priority based on threshold', () => {
    const analysis = {
      questions: [
        { text: 'Alta frequencia', count: SUGGESTION_THRESHOLD },
        { text: 'Media frequencia', count: MIN_PATTERN_THRESHOLD },
      ],
      pains: [],
      topics: { bigrams: [], trigrams: [] },
      viral: [],
    };

    const suggestions = suggestContent(analysis);
    expect(suggestions[0].priority).toBe('high');
    expect(suggestions[1].priority).toBe('medium');
  });
});
