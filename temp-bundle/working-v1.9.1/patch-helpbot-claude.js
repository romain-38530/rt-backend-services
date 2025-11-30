const fs = require('fs');

// Read the file
let content = fs.readFileSync('helpbot-service.js', 'utf8');

// Find the _generateResponse method
const searchString = 'async _generateResponse(conversation, content, analysis) {';
const methodStart = content.indexOf(searchString);

if (methodStart === -1) {
  console.error('❌ Method _generateResponse not found');
  process.exit(1);
}

// Find the end of the method (next method starts with "  /**")
const searchAfter = methodStart + 500;
const nextCommentIndex = content.indexOf('  /**', searchAfter);
let methodEnd = content.lastIndexOf('\n  }', nextCommentIndex);

// Extract method content
const originalMethod = content.substring(methodStart, methodEnd + 4);

// New method with Claude integration
const newMethod = `async _generateResponse(conversation, content, analysis) {
    const response = {
      content: '',
      suggestions: [],
      articles: [],
      attachments: [],
      diagnostic: null,
      requiresEscalation: false
    };

    // Si priorite critique, reponse immediate
    if (analysis.priority === PriorityLevels.CRITICAL) {
      response.content = "Je comprends que vous rencontrez un probleme critique. Votre demande est prioritaire.\\n\\n";

      // Executer diagnostic automatique si applicable
      if (analysis.requiresDiagnostic) {
        const diagnostic = await this._runAutoDiagnostic(conversation, analysis);
        response.diagnostic = diagnostic;
        response.content += \`**Diagnostic automatique:**\\n\${this._formatDiagnosticResult(diagnostic)}\\n\\n\`;
      }

      response.content += "Je transfere immediatement votre demande a notre equipe technique.";
      response.requiresEscalation = true;
      return response;
    }

    // Rechercher dans les FAQ (rapide)
    const faqs = await this._searchFAQs(content, conversation.chatbotType);
    if (faqs.length > 0) {
      response.content = faqs[0].answer;
      response.suggestions = [
        'Cela repond a ma question',
        'J\\'ai besoin de plus de details',
        'J\\'ai une autre question'
      ];
      if (faqs.length > 1) {
        response.content += '\\n\\n**Questions similaires:**';
        faqs.slice(1, 3).forEach((faq, i) => {
          response.content += \`\\n\${i + 2}. \${faq.question}\`;
        });
      }
      return response;
    }

    // Utiliser Claude IA pour une reponse intelligente
    if (this.claudeService && this.claudeService.isEnabled()) {
      try {
        const claudeResponse = await this.claudeService.generateResponse({
          chatbotType: conversation.chatbotType,
          userRole: conversation.userRole,
          userMessage: content,
          conversationHistory: conversation.messages || [],
          context: {
            priority: analysis.priority,
            category: analysis.category,
            module: analysis.module,
            orderNumber: conversation.context?.orderReference
          }
        });

        if (claudeResponse.success) {
          response.content = claudeResponse.response;
          response.suggestions = [
            'Cela repond a ma question',
            'J\\'ai besoin de plus de details',
            'Parler a un technicien'
          ];

          // Ajouter metadata Claude
          response.metadata = {
            generatedBy: 'claude',
            tokensUsed: claudeResponse.usage
          };

          return response;
        }
      } catch (error) {
        console.error('❌ Erreur Claude AI, fallback vers reponses statiques:', error.message);
        // Continue vers les reponses statiques en cas d'erreur
      }
    }

    // Fallback: Rechercher dans la base de connaissances
    const articles = await this._searchKnowledgeBase(content, analysis);
    if (articles.length > 0) {
      response.articles = articles.slice(0, 3);
      response.content = \`J'ai trouve \${articles.length} article(s) qui pourraient vous aider:\\n\\n\`;
      articles.slice(0, 3).forEach((article, i) => {
        response.content += \`**\${i + 1}. \${article.title}**\\n\${article.summary}\\n\\n\`;
      });
      response.suggestions = [
        'Voir l\\'article 1',
        'Voir l\\'article 2',
        'Parler a un technicien'
      ];
      return response;
    }

    // Derniere option: Reponse basee sur la categorie
    response.content = this._getCategoryResponse(analysis.category, analysis.module);
    response.suggestions = this._getCategorySuggestions(analysis.category);

    // Si priorite importante apres plusieurs interactions
    if (analysis.priority === PriorityLevels.IMPORTANT && conversation.botInteractions >= 2) {
      response.content += '\\n\\nSi le probleme persiste, je peux vous mettre en relation avec un technicien.';
      response.suggestions.push('Parler a un technicien');
    }

    return response;
  }`;

// Replace the method
content = content.replace(originalMethod, newMethod);

// Write back
fs.writeFileSync('helpbot-service.js', content);

console.log('✅ helpbot-service.js patched with Claude IA integration');
