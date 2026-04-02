plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

android {
    namespace = "com.yourorg.buildingdrone"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.yourorg.buildingdrone"
        minSdk = 26
        targetSdk = 34
        versionCode = 2
        versionName = "0.2.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        manifestPlaceholders["DJI_API_KEY"] = project.findProperty("DJI_API_KEY") as String? ?: "MISSING_DJI_API_KEY"
    }

    flavorDimensions += "mode"
    productFlavors {
        create("demo") {
            dimension = "mode"
            applicationIdSuffix = ".demo"
            versionNameSuffix = "-demo"
            buildConfigField("String", "APP_MODE", "\"demo\"")
        }
        create("prod") {
            dimension = "mode"
            buildConfigField("String", "APP_MODE", "\"prod\"")
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
        jniLibs {
            useLegacyPackaging = true
            pickFirsts += listOf(
                "lib/arm64-v8a/libc++_shared.so",
                "lib/armeabi-v7a/libc++_shared.so"
            )
            keepDebugSymbols += listOf(
                "**/libDJIRegister.so",
                "**/libdjisdk_jni.so",
                "**/libDJIFlySafeCore-CSDK.so",
                "**/libDJIWaypointV2Core-CSDK.so"
            )
        }
    }
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2024.06.00")
    val djiSdkVersion = "5.17.0"

    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.3")
    implementation("androidx.lifecycle:lifecycle-process:2.8.3")
    implementation("androidx.activity:activity-compose:1.9.1")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")
    implementation("androidx.datastore:datastore-preferences:1.1.1")
    implementation(composeBom)
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("com.google.android.material:material:1.12.0")

    compileOnly("com.dji:dji-sdk-v5-aircraft-provided:$djiSdkVersion")
    add("prodImplementation", "com.dji:dji-sdk-v5-aircraft:$djiSdkVersion")
    add("prodRuntimeOnly", "com.dji:dji-sdk-v5-networkImp:$djiSdkVersion")
    testImplementation("com.dji:dji-sdk-v5-aircraft-provided:$djiSdkVersion")

    testImplementation("junit:junit:4.13.2")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.8.1")

    debugImplementation(composeBom)
    debugImplementation("androidx.compose.ui:ui-tooling")
    debugImplementation("androidx.compose.ui:ui-test-manifest")
}
