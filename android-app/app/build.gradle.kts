import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
    id("org.jetbrains.kotlin.plugin.serialization")
}

val localProperties = Properties().apply {
    val localPropertiesFile = rootProject.file("local.properties")
    if (localPropertiesFile.exists()) {
        localPropertiesFile.inputStream().use(::load)
    }
}
val djiApiKeyProvider = providers.gradleProperty("DJI_API_KEY")
    .orElse(providers.environmentVariable("DJI_API_KEY"))
val localPropertiesDjiApiKey = localProperties.getProperty("DJI_API_KEY")
val resolvedDjiApiKey = djiApiKeyProvider.orNull?.takeIf { it.isNotBlank() }
    ?: localPropertiesDjiApiKey?.takeIf { it.isNotBlank() }
    ?: "MISSING_DJI_API_KEY"

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
        manifestPlaceholders["DJI_API_KEY"] = resolvedDjiApiKey
        resValue(
            "string",
            "planner_base_url",
            project.findProperty("PLANNER_BASE_URL") as String? ?: "http://10.0.2.2:8000"
        )
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

tasks.configureEach {
    val isProdPackagingTask = name.startsWith("assembleProd") ||
        name.startsWith("installProd") ||
        name.startsWith("packageProd") ||
        name.startsWith("bundleProd")
    if (isProdPackagingTask) {
        doFirst {
            if (resolvedDjiApiKey == "MISSING_DJI_API_KEY") {
                throw GradleException(
                    "DJI_API_KEY is required for prod builds. Pass -PDJI_API_KEY=... or set DJI_API_KEY in the environment."
                )
            }
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
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.8.0")
    implementation("androidx.datastore:datastore-preferences:1.1.1")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
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
