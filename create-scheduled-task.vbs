Set service = CreateObject("Schedule.Service")
service.Connect

Set rootFolder = service.GetFolder("\")

' Supprimer tache existante si presente
On Error Resume Next
rootFolder.DeleteTask "AWS Optimizer Routine Autonome", 0
On Error Goto 0

' Creer nouvelle tache
Set taskDefinition = service.NewTask(0)
taskDefinition.RegistrationInfo.Description = "Routine autonome optimisation AWS - Execution quotidienne"

' Declencheur quotidien a 2h00
Set triggers = taskDefinition.Triggers
Set trigger = triggers.Create(2) ' 2 = Daily trigger
trigger.StartBoundary = "2026-02-24T02:00:00"
trigger.DaysInterval = 1
trigger.Enabled = True

' Action - executer le batch
Set actions = taskDefinition.Actions
Set action = actions.Create(0) ' 0 = Execute action
action.Path = WScript.ScriptFullName
action.Path = Replace(action.Path, "create-scheduled-task.vbs", "run-optimizer.bat")

' Parametres
Set settings = taskDefinition.Settings
settings.Enabled = True
settings.StartWhenAvailable = True
settings.Hidden = False
settings.ExecutionTimeLimit = "PT2H"

' Enregistrer la tache
Set principal = taskDefinition.Principal
principal.LogonType = 3 ' S4U

rootFolder.RegisterTaskDefinition "AWS Optimizer Routine Autonome", taskDefinition, 6, , , 3

WScript.Echo "Tache planifiee creee avec succes!"
WScript.Echo "Nom: AWS Optimizer Routine Autonome"
WScript.Echo "Planification: Quotidien a 02:00"
