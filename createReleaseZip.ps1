$buildRoot = ".\build"
$target = Join-Path $buildRoot "release"
$targetFile = Join-Path $buildRoot "dark-heresy.zip"

if (-Not (Test-Path -Path $buildRoot)) {
	New-Item -Path $buildRoot -ItemType Directory | Out-Null
}

if (Test-Path -Path $target) {
	Remove-Item $target -Recurse -Force
}
New-Item -Path $target -ItemType Directory | Out-Null

gulp buildAll

Copy-Item -Path ".\asset" -Destination $target -Recurse
Copy-Item -Path ".\lang" -Destination $target -Recurse
Copy-Item -Path ".\logo" -Destination $target -Recurse
Copy-Item -Path ".\packs" -Destination $target -Recurse
Copy-Item -Path ".\script\*" -Destination (Join-Path $target "script") -Recurse -Exclude "dark-heresy.js"
Copy-Item -Path ".\template" -Destination $target -Recurse
Copy-item -Path ".\CONTRIBUTING.md" -Destination $target
Copy-item -Path ".\README.md" -Destination $target
Copy-item -Path ".\LICENSE" -Destination $target
Copy-item -Path ".\system.json" -Destination $target
Copy-item -Path ".\template.json" -Destination $target

if(Test-Path -Path $targetFile -PathType Leaf) {
	Remove-Item $targetFile
}

$compress = @{
	Path = "$target\*"
	CompressionLevel = "Optimal"
	DestinationPath = $targetFile
}
Compress-Archive @compress
