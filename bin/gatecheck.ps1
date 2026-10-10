$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$entry = Join-Path (Split-Path -Parent $scriptDir) "src\index.js"
& node $entry $args
exit $LASTEXITCODE
