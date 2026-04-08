using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Wordprocessing;
using A = DocumentFormat.OpenXml.Drawing;
using DW = DocumentFormat.OpenXml.Drawing.Wordprocessing;
using PIC = DocumentFormat.OpenXml.Drawing.Pictures;
using Vanguard.Bootstrapper.Models;

namespace Vanguard.Bootstrapper.Reports;

public static class BuildingReportGenerator
{
    public static byte[] GenerateDocx(Building building)
    {
        using var ms = new MemoryStream();
        using (var doc = WordprocessingDocument.Create(ms, WordprocessingDocumentType.Document))
        {
            var main = doc.AddMainDocumentPart();
            main.Document = new Document(new Body());

            var body = main.Document.Body!;

            body.Append(ParagraphText(string.Empty));
            body.Append(Heading(building.Name, 1));

            var anchors = building.Tags.Where(t => t.Type == TagType.Anchor).OrderBy(t => t.Seq).ToList();
            var cleanings = building.Tags.Where(t => t.Type == TagType.Cleaning).OrderBy(t => t.Seq).ToList();
            var issues = building.Tags.Where(t => t.Type == TagType.Issue).OrderBy(t => t.Seq).ToList();

            AppendTagSection(doc, body, "Anchor points", anchors, photoMode: TagType.Anchor);
            AppendTagSection(doc, body, "Cleanings", cleanings, photoMode: TagType.Cleaning);
            AppendTagSection(doc, body, "Issues", issues, photoMode: TagType.Issue);

            main.Document.Save();
        }
        return ms.ToArray();
    }

    private static void AppendTagSection(WordprocessingDocument doc, Body body, string title, List<Vanguard.Bootstrapper.Models.Tag> tags, TagType photoMode)
    {
        body.Append(Heading(title, 2));

        if (tags.Count == 0)
        {
            body.Append(ParagraphText("—"));
            return;
        }

        foreach (var t in tags)
        {
            var tagTitle = $"#{t.Seq}{(string.IsNullOrWhiteSpace(t.Name) ? "" : $" • {t.Name}")}";
            body.Append(Heading(tagTitle, 3));

            if (t.Type == TagType.Anchor)
                body.Append(ParagraphText($"Status: {t.Status}"));
            else if (t.Type == TagType.Cleaning)
                body.Append(ParagraphText($"Status: {t.Status}"));

            var comments = (t.Comments ?? []).OrderBy(c => c.CreatedAt).ToList();
            body.Append(Heading("Comments", 4));
            if (comments.Count == 0)
            {
                body.Append(ParagraphText("—"));
            }
            else
            {
                foreach (var c in comments)
                    body.Append(ParagraphText($"{c.CreatedAt:u} — {c.Text}"));
            }

            var photos = (t.Photos ?? []).OrderBy(p => p.CreatedAt).ToList();
            if (photoMode == TagType.Cleaning)
            {
                body.Append(Heading("Photos (before)", 4));
                AppendPhotos(doc, body, photos.Where(p => p.Kind == TagPhotoKind.Before).ToList());
                body.Append(Heading("Photos (after)", 4));
                AppendPhotos(doc, body, photos.Where(p => p.Kind == TagPhotoKind.After).ToList());
            }
            else
            {
                body.Append(Heading("Photos", 4));
                AppendPhotos(doc, body, photos.Where(p => p.Kind == TagPhotoKind.General).ToList());
            }

            body.Append(new Paragraph(new Run(new Break() { Type = BreakValues.Page })));
        }
    }

    private static void AppendPhotos(WordprocessingDocument doc, Body body, List<TagPhoto> photos)
    {
        if (photos.Count == 0)
        {
            body.Append(ParagraphText("—"));
            return;
        }

        foreach (var p in photos)
        {
            body.Append(ParagraphText($"{p.CreatedAt:u} — {p.FileName}"));
            if (p.Blob is null || p.Blob.Length == 0) continue;
            var drawing = CreateImageDrawing(doc, p.Blob, p.ContentType);
            if (drawing is not null)
                body.Append(new Paragraph(new Run(drawing)));
        }
    }

    private static Drawing? CreateImageDrawing(WordprocessingDocument doc, byte[] bytes, string contentType)
    {
        var imageType =
            contentType.Contains("png", StringComparison.OrdinalIgnoreCase) ? ImagePartType.Png :
            contentType.Contains("gif", StringComparison.OrdinalIgnoreCase) ? ImagePartType.Gif :
            contentType.Contains("bmp", StringComparison.OrdinalIgnoreCase) ? ImagePartType.Bmp :
            contentType.Contains("tiff", StringComparison.OrdinalIgnoreCase) ? ImagePartType.Tiff :
            ImagePartType.Jpeg;

        var main = doc.MainDocumentPart!;
        var imagePart = main.AddImagePart(imageType);
        using (var stream = new MemoryStream(bytes))
            imagePart.FeedData(stream);

        var relId = main.GetIdOfPart(imagePart);
        var imageId = (UInt32Value)(uint)Random.Shared.Next(1, int.MaxValue);
        var name = "Photo";

        const long emusPerInch = 914400;
        const long maxWidthInInches = 5;
        const double maxHeightInInches = 3.5;
        var cx = maxWidthInInches * emusPerInch;
        var cy = (long)(maxHeightInInches * emusPerInch);

        return new Drawing(
            new DW.Inline(
                new DW.Extent() { Cx = cx, Cy = cy },
                new DW.EffectExtent()
                {
                    LeftEdge = 0L,
                    TopEdge = 0L,
                    RightEdge = 0L,
                    BottomEdge = 0L
                },
                new DW.DocProperties() { Id = imageId, Name = name },
                new DW.NonVisualGraphicFrameDrawingProperties(new A.GraphicFrameLocks() { NoChangeAspect = true }),
                new A.Graphic(
                    new A.GraphicData(
                        new PIC.Picture(
                            new PIC.NonVisualPictureProperties(
                                new PIC.NonVisualDrawingProperties() { Id = imageId, Name = name },
                                new PIC.NonVisualPictureDrawingProperties()),
                            new PIC.BlipFill(
                                new A.Blip()
                                {
                                    Embed = relId,
                                    CompressionState = A.BlipCompressionValues.Print
                                },
                                new A.Stretch(new A.FillRectangle())),
                            new PIC.ShapeProperties(
                                new A.Transform2D(
                                    new A.Offset() { X = 0L, Y = 0L },
                                    new A.Extents() { Cx = cx, Cy = cy }),
                                new A.PresetGeometry(new A.AdjustValueList())
                                { Preset = A.ShapeTypeValues.Rectangle }))
                    )
                    { Uri = "http://schemas.openxmlformats.org/drawingml/2006/picture" })
            )
            {
                DistanceFromTop = 0U,
                DistanceFromBottom = 0U,
                DistanceFromLeft = 0U,
                DistanceFromRight = 0U,
            });
    }

    private static Paragraph Heading(string text, int level)
    {
        var p = new Paragraph(
            new ParagraphProperties(new ParagraphStyleId() { Val = $"Heading{level}" }),
            new Run(new Text(text) { Space = SpaceProcessingModeValues.Preserve })
        );
        return p;
    }

    private static Paragraph ParagraphText(string text)
    {
        return new Paragraph(new Run(new Text(text) { Space = SpaceProcessingModeValues.Preserve }));
    }
}

