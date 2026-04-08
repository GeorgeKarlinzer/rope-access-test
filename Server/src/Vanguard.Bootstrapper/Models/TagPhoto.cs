namespace Vanguard.Bootstrapper.Models
{
    public class TagPhoto
    {
        public Guid Id { get; set; }
        public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
        public string FileName { get; set; } = string.Empty;
        public string ContentType { get; set; } = "application/octet-stream";
        public byte[] Blob { get; set; } = [];
        public TagPhotoKind Kind { get; set; } = TagPhotoKind.General;
    }
}

