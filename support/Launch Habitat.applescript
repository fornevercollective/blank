-- Source for Launch Habitat.app in the blank repo root.
-- Compile (from repo root):
--   osacompile -o "Launch Habitat.app" "support/Launch Habitat.applescript"

on run
	tell application "Finder"
		set projectFolder to container of (path to me as alias) as alias
		set projectPath to POSIX path of projectFolder
	end tell
	set sh to quoted form of (projectPath & "support/cursor-habitat/launch-habitat-terminal.sh")
	set cmd to "cd " & quoted form of projectPath & " && exec " & sh
	tell application "Terminal"
		activate
		do script cmd
	end tell
end run

