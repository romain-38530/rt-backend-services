const fs = require('fs');

let content = fs.readFileSync('specialized-assistants.js', 'utf8');

// 1. Add import after ObjectId
const importLine = "const { ObjectId } = require('mongodb');";
const newImport = importLine + "\nconst { ClaudeIntegrationService } = require('./claude-integration');";
content = content.replace(importLine, newImport);

// 2. Add claudeService in BaseAssistant constructor
const constructorLine = "    this.organizations = db.collection('organizations');";
const newConstructorLine = constructorLine + "\n    this.claudeService = new ClaudeIntegrationService();";
content = content.replace(constructorLine, newConstructorLine);

// 3. Find the end of BaseAssistant class and add helper method
// Find the _emitEvent method and add after it
const emitEventMethod = `  _emitEvent(eventName, data) {
    if (this.eventEmitter) {
      this.eventEmitter.emit(eventName, data);
    }
  }`;

const helperMethod = `  _emitEvent(eventName, data) {
    if (this.eventEmitter) {
      this.eventEmitter.emit(eventName, data);
    }
  }

  /**
   * Generer une reponse avec Claude IA (fallback vers reponse par defaut)
   */
  async _generateResponseWithClaude(conversation, content, defaultResponse) {
    // Essayer Claude d'abord
    if (this.claudeService && this.claudeService.isEnabled()) {
      try {
        const claudeResponse = await this.claudeService.generateResponse({
          chatbotType: conversation.chatbotType,
          userRole: conversation.userRole,
          userMessage: content,
          conversationHistory: conversation.messages || [],
          context: {
            module: conversation.module,
            orderNumber: conversation.context?.orderReference
          }
        });

        if (claudeResponse.success) {
          return {
            content: claudeResponse.response,
            suggestions: defaultResponse.suggestions || ['Cela repond a ma question', 'J\\'ai une autre question'],
            attachments: [],
            metadata: {
              generatedBy: 'claude',
              tokensUsed: claudeResponse.usage
            }
          };
        }
      } catch (error) {
        console.error('❌ Erreur Claude AI pour', conversation.chatbotType, ':', error.message);
        // Fallback vers reponse par defaut
      }
    }

    // Fallback: reponse par defaut
    return defaultResponse;
  }`;

content = content.replace(emitEventMethod, helperMethod);

fs.writeFileSync('specialized-assistants.js', content);

console.log('✅ specialized-assistants.js: Claude integration added to BaseAssistant');
console.log('   - Import added');
console.log('   - ClaudeIntegrationService initialized in constructor');
console.log('   - Helper method _generateResponseWithClaude() added');
console.log('');
console.log('⚠️  Note: Each specialized assistant should call this._generateResponseWithClaude()');
console.log('   instead of returning hardcoded responses.');
