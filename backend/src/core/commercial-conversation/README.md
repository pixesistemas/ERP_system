# Commercial Conversation

Conecta `CommercialCommand` con el flujo conversacional y el `WorkspaceEngine`.

## Flujo

```text
Mensaje
   ↓
CommercialParser
   ↓
CommercialCommand
   ↓
CommercialConversationEngine
   ↓
Resolver cliente y productos
   ↓
Workspace
   ↓
Confirmación
```
