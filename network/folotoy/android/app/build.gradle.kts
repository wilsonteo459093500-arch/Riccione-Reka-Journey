plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "app.space.car"
    compileSdk = 35

    defaultConfig {
        applicationId = "app.space.car"
        minSdk = 26          // Android 8.0：无障碍手势「接着按住」要这个版本
        targetSdk = 35
        versionCode = 4
        versionName = "0.4"
    }

    // 固定的 debug 签名（../debug.keystore，Android 标准 debug 帐密）：
    // 以后出新版可以直接覆盖安装，不用先删掉旧的。这不是上架用的签名。
    signingConfigs {
        getByName("debug") {
            storeFile = rootProject.file("debug.keystore")
            storePassword = "android"
            keyAlias = "androiddebugkey"
            keyPassword = "android"
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    testImplementation("junit:junit:4.13.2")
}
