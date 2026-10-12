# System tray icon for the AskLens PC companion. Prints one word per click
# (open, pause, resume, login-on, login-off, quit) and reads commands
# (paused, notify) from the file given as -InFile.
param([string]$InFile, [string]$Paused, [string]$Login)
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
$bmp = New-Object Drawing.Bitmap 32, 32
$g = [Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = 'AntiAlias'
$g.FillEllipse((New-Object Drawing.SolidBrush ([Drawing.Color]::FromArgb(22, 163, 74))), 1, 1, 30, 30)
$f = New-Object Drawing.Font 'Segoe UI', 16, ([Drawing.FontStyle]::Bold), ([Drawing.GraphicsUnit]::Pixel)
$g.DrawString('A', $f, [Drawing.Brushes]::White, 7, 5)
$ni = New-Object Windows.Forms.NotifyIcon
$ni.Icon = [Drawing.Icon]::FromHandle($bmp.GetHicon())
$ni.Text = 'AskLens PC companion'
$ni.Visible = $true
$menu = New-Object Windows.Forms.ContextMenuStrip
$open = $menu.Items.Add('Open pairing window')
$send = $menu.Items.Add('Send to phone')
$send.CheckOnClick = $true; $send.Checked = ($Paused -ne '1')
$login = $menu.Items.Add('Start when I sign in')
$login.CheckOnClick = $true; $login.Checked = ($Login -eq '1')
$null = $menu.Items.Add('-')
$quit = $menu.Items.Add('Quit')
$ni.ContextMenuStrip = $menu
$open.add_Click({ [Console]::Out.WriteLine('open') })
$send.add_Click({ if ($send.Checked) { [Console]::Out.WriteLine('resume') } else { [Console]::Out.WriteLine('pause') } })
$login.add_Click({ if ($login.Checked) { [Console]::Out.WriteLine('login-on') } else { [Console]::Out.WriteLine('login-off') } })
$quit.add_Click({ $ni.Visible = $false; [Console]::Out.WriteLine('quit'); [Windows.Forms.Application]::Exit() })
$ni.add_DoubleClick({ [Console]::Out.WriteLine('open') })
$t = New-Object Windows.Forms.Timer
$t.Interval = 700
$t.add_Tick({
  if (-not (Test-Path $InFile)) { return }
  try { $lines = Get-Content $InFile -Encoding UTF8; Remove-Item $InFile -Force } catch { return }
  foreach ($l in $lines) {
    $p = $l -split "`t"
    if ($p[0] -eq 'paused') { $send.Checked = ($p[1] -ne '1') }
    elseif ($p[0] -eq 'notify') { $ni.BalloonTipTitle = $p[1]; $ni.BalloonTipText = $p[2]; $ni.ShowBalloonTip(5000) }
  }
})
$t.Start()
[Windows.Forms.Application]::Run()
