#!/bin/bash

# Backup du fichier original
cp index.js index.js.backup-$(date +%Y%m%d-%H%M%S)

# Créer le nouveau contenu avec la détection améliorée
cat > temp-error-handling.txt << 'INNER_EOF'
    } catch (dbError) {
      console.error('MongoDB insert error:', dbError);

      // Check if it's a duplicate key error
      if (dbError.code === 11000) {
        // Déterminer quel champ est en double
        const duplicateField = dbError.keyValue;
        let errorMessage = 'An onboarding request already exists';

        if (duplicateField && duplicateField.vatNumber) {
          errorMessage = `Cette entreprise (TVA: ${duplicateField.vatNumber}) est déjà enregistrée dans notre système`;
        } else if (duplicateField && duplicateField.email) {
          errorMessage = `Cette adresse email (${duplicateField.email}) est déjà enregistrée dans notre système`;
        }

        return res.status(409).json({
          success: false,
          error: {
            code: 'DUPLICATE_REQUEST',
            message: errorMessage,
            field: duplicateField ? Object.keys(duplicateField)[0] : 'unknown'
          }
        });
      }

      return res.status(500).json({
        success: false,
        error: {
          code: 'DATABASE_ERROR',
          message: 'Failed to save onboarding request'
        }
      });
    }
INNER_EOF

# Extraire les parties avant et après la section à remplacer
head -n 677 index.js > index-new.js
cat temp-error-handling.txt >> index-new.js
tail -n +700 index.js >> index-new.js

# Remplacer l'ancien fichier
mv index-new.js index.js

# Nettoyer
rm temp-error-handling.txt

echo "✅ Fichier index.js mis à jour avec succès"
