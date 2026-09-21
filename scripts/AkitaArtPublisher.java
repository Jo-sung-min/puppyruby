import tools.jackson.databind.*;
import software.amazon.awssdk.services.s3.*;
import software.amazon.awssdk.services.s3.model.*;
import software.amazon.awssdk.auth.credentials.*;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.core.sync.RequestBody;
import java.nio.file.*;
import java.net.*;
import java.net.http.*;
import java.time.Duration;
import java.security.MessageDigest;
import java.util.*;

/** Publish only approved Akita content-addressed PNGs. Never delete or replace another release. */
public class AkitaArtPublisher {
 static String phase="configuration";
 public static void main(String[] args) throws Exception {
  try { run(Path.of(args[0]).toRealPath()); }
  catch(Exception e){String detail=Set.of("Destination outside project","Invalid hash","Hash mismatch","Existing immutable object differs","CDN verification failed","CDN CORS missing").contains(String.valueOf(e.getMessage()))?e.getMessage():e.getClass().getSimpleName();System.out.println("Akita publish failed ("+phase+"): "+detail);System.exit(1);}
 }
 static void run(Path root) throws Exception {
  ObjectMapper json=new ObjectMapper();Map<String,String> cfg=new HashMap<>();
  Set<String> keys=Set.of("S3_BUCKET","AWS_REGION","S3_KEY_PREFIX","CDN_BASE_URL","CDN_ORIGIN_PATH","AWS_ACCESS_KEY_ID","AWS_SECRET_ACCESS_KEY","AWS_SESSION_TOKEN");
  for(String name:List.of(".env",".env.local")){
   Path p=root.resolve("backend").resolve(name);if(!Files.exists(p))continue;
   for(String raw:Files.readAllLines(p)){String line=raw.strip().replace("\uFEFF","");if(line.startsWith("export "))line=line.substring(7);int eq=line.indexOf('=');if(eq<1||line.startsWith("#"))continue;String k=line.substring(0,eq).strip(),v=line.substring(eq+1).strip();if(!keys.contains(k))continue;if(v.length()>1&&((v.startsWith("\"")&&v.endsWith("\""))||(v.startsWith("'")&&v.endsWith("'"))))v=v.substring(1,v.length()-1);cfg.put(k,v);}
  }
  if(!"fatell-aws-s3".equals(cfg.get("S3_BUCKET"))||!"puppyruby".equals(cfg.get("S3_KEY_PREFIX")))throw new IllegalArgumentException("Destination outside project");
  JsonNode art=json.readTree(root.resolve("frontend/src/lib/generated/akita-art-revision.json").toFile());
  TreeSet<String> hashes=new TreeSet<>();
  for(JsonNode a:art.path("actions"))for(String k:List.of("bodySha256","maskSha256","closedSha256","desktopBodySha256","desktopMaskSha256","previewSha256","compatibilitySha256"))hashes.add(a.path(k).asText());
  hashes.add(json.readTree(root.resolve("frontend/src/lib/generated/akita-coat-assets.json").toFile()).path("glasses").path("sha256").asText());
  String masterHash=art.path("sourceSha256").asText();hashes.add(masterHash);
  String baseKey="puppyruby/site-packs/akita-coat",base=SiteDownloadPublisher.cdnBase(cfg.get("CDN_BASE_URL"),baseKey,cfg.getOrDefault("CDN_ORIGIN_PATH","").replaceAll("^/+|/+$",""));
  AwsCredentials creds=cfg.getOrDefault("AWS_SESSION_TOKEN","").isBlank()?AwsBasicCredentials.create(cfg.get("AWS_ACCESS_KEY_ID"),cfg.get("AWS_SECRET_ACCESS_KEY")):AwsSessionCredentials.create(cfg.get("AWS_ACCESS_KEY_ID"),cfg.get("AWS_SECRET_ACCESS_KEY"),cfg.get("AWS_SESSION_TOKEN"));
  Path assetRoot=root.resolve("local-assets/site/akita-coat").toRealPath();
  try(S3Client s3=S3Client.builder().region(Region.of(cfg.get("AWS_REGION"))).credentialsProvider(StaticCredentialsProvider.create(creds)).overrideConfiguration(c->c.apiCallTimeout(Duration.ofSeconds(45))).build()){
   phase="S3 upload";
   for(String hash:hashes){
    String extension=hash.equals(masterHash)?".aseprite":".png";
    if(!hash.matches("[a-f0-9]{64}"))throw new IllegalArgumentException("Invalid hash");Path file=assetRoot.resolve(hash+extension).toRealPath();if(!file.startsWith(assetRoot))throw new IllegalArgumentException();byte[] bytes=Files.readAllBytes(file);if(!digest(bytes).equals(hash))throw new IllegalArgumentException("Hash mismatch");
    String key=baseKey+"/"+hash+extension;
    try{HeadObjectResponse h=s3.headObject(HeadObjectRequest.builder().bucket(cfg.get("S3_BUCKET")).key(key).build());if(h.contentLength()!=bytes.length||!hash.equals(h.metadata().get("sha256")))throw new IllegalArgumentException("Existing immutable object differs");}
    catch(S3Exception e){if(e.statusCode()!=404)throw e;s3.putObject(PutObjectRequest.builder().bucket(cfg.get("S3_BUCKET")).key(key).contentType(hash.equals(masterHash)?"application/octet-stream":"image/png").cacheControl("public,max-age=31536000,immutable").metadata(Map.of("sha256",hash)).build(),RequestBody.fromBytes(bytes));}
   }
  }
  try(HttpClient http=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(15)).followRedirects(HttpClient.Redirect.NEVER).build()){
   phase="CDN verification";
   // Browsers read pixel data through the finite same-origin /api/akita-coat route.
   // Public CDN images and desktop downloads do not depend on browser CORS.
   for(String hash:hashes){var response=http.send(HttpRequest.newBuilder(URI.create(base+"/"+hash+(hash.equals(masterHash)?".aseprite":".png"))).timeout(Duration.ofSeconds(30)).GET().build(),HttpResponse.BodyHandlers.ofByteArray());if(response.statusCode()!=200||!digest(response.body()).equals(hash))throw new IllegalArgumentException("CDN verification failed");}
  }
  SiteDownloadPublisher.replaceAtomically(root.resolve("frontend/src/lib/generated/akita-art-release.json"),json.writeValueAsBytes(Map.of("revision",art.path("revision").asText(),"baseUrl",base)));
  System.out.println("Verified Akita files on S3/CDN: "+hashes.size());
 }
 static String digest(byte[] b)throws Exception{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(b));}
}
