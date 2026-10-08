$ErrorActionPreference = 'Stop'

$jdkRoot = Join-Path $env:USERPROFILE '.jdks\temurin-21\jdk-21.0.12.1+1'
$keytool = Join-Path $jdkRoot 'bin\keytool.exe'
$keystoreDirectory = Join-Path $env:USERPROFILE '.farmiqo'
$keystorePath = Join-Path $keystoreDirectory 'farmiqo-release.p12'

if (!(Test-Path $keytool)) {
    throw "JDK 21 keytool not found at $keytool. Install the Android JDK first."
}
if (Test-Path $keystorePath) {
    throw "A release keystore already exists at $keystorePath. It was not overwritten."
}

New-Item -ItemType Directory -Path $keystoreDirectory -Force | Out-Null
$random = [byte[]]::new(48)
[Security.Cryptography.RandomNumberGenerator]::Fill($random)
$password = [Convert]::ToBase64String($random).TrimEnd('=').Replace('+', '-').Replace('/', '_')

& $keytool -genkeypair -v -keystore $keystorePath -storetype PKCS12 -alias farmiqo -keyalg RSA -keysize 3072 -validity 10000 -dname 'CN=Farmiqo App, O=Farmiqo, C=IN' -storepass $password -keypass $password -noprompt
if ($LASTEXITCODE -ne 0) {
    Remove-Item -LiteralPath $keystorePath -Force -ErrorAction SilentlyContinue
    throw 'Failed to create the Farmiqo release keystore.'
}

$signingEnvironment = @{
    FARMIQO_KEYSTORE_PATH = $keystorePath
    FARMIQO_KEYSTORE_PASSWORD = $password
    FARMIQO_KEY_ALIAS = 'farmiqo'
    FARMIQO_KEY_PASSWORD = $password
}
foreach ($entry in $signingEnvironment.GetEnumerator()) {
    [Environment]::SetEnvironmentVariable($entry.Key, $entry.Value, 'User')
    [Environment]::SetEnvironmentVariable($entry.Key, $entry.Value, 'Process')
}

Write-Output "Release keystore created outside the project at $keystorePath."
Write-Output 'Signing values are stored in your Windows user environment and were not printed.'
Write-Warning 'Back up the .farmiqo folder and signing environment securely. Losing the key prevents future updates to this Android app.'
