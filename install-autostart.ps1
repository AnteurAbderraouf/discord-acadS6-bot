# Makes the bot start automatically at every logon, by putting a shortcut to
# start-bot.vbs in the current user's Startup folder. No admin rights needed.
#
#   Install:   powershell -ExecutionPolicy Bypass -File .\install-autostart.ps1
#   Uninstall: powershell -ExecutionPolicy Bypass -File .\install-autostart.ps1 -Uninstall

param([switch]$Uninstall)

$vbs       = Join-Path $PSScriptRoot "start-bot.vbs"
$startup   = [Environment]::GetFolderPath("Startup")
$shortcut  = Join-Path $startup "DiscordAcadS6Bot.lnk"

if ($Uninstall) {
    if (Test-Path $shortcut) {
        Remove-Item $shortcut -Force
        Write-Host "Removed autostart shortcut. The bot will no longer start at logon."
    } else {
        Write-Host "No autostart shortcut found - nothing to remove."
    }
    return
}

if (-not (Test-Path $vbs)) { throw "start-bot.vbs not found next to this script." }

$sh = New-Object -ComObject WScript.Shell
$lnk = $sh.CreateShortcut($shortcut)
$lnk.TargetPath       = Join-Path $env:WINDIR "System32\wscript.exe"
$lnk.Arguments        = '"' + $vbs + '"'
$lnk.WorkingDirectory = $PSScriptRoot
$lnk.Description      = "Discord acad-S6 student verification bot"
$lnk.Save()

Write-Host "Installed: $shortcut"
Write-Host "The bot will now start automatically at every logon."
Write-Host "Start it right now without rebooting:  wscript `"$vbs`""
Write-Host "Output is appended to bot.log in this folder."
