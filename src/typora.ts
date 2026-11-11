import { open, showToast, Toast } from '@raycast/api'
import { runAppleScript } from '@raycast/utils'

export async function openInTypora(file: string, findText?: string) {
  await open(file, 'abnerworks.Typora')
  if (!findText) return
  const fileName = file.split('/').pop() ?? file
  try {
    await runAppleScript(
      `
on run argv
  set fileName to item 1 of argv
  set findText to item 2 of argv
  tell application "Typora" to activate
  tell application "System Events"
    repeat 30 times
      try
        if name of front window of process "Typora" contains fileName then exit repeat
      end try
      delay 0.1
    end repeat
    delay 0.2
    keystroke "f" using command down
    delay 0.15
    keystroke findText
  end tell
end run`,
      [fileName, findText],
    )
  } catch {
    await showToast({
      style: Toast.Style.Failure,
      title: 'Opened, but could not open the find bar',
      message: 'Give Raycast Accessibility access in System Settings → Privacy & Security.',
    })
  }
}
