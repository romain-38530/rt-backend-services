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
